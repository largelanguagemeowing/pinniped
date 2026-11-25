import React from 'react';
import { EventEmitter } from 'node:events';
import { Provider } from 'jotai';
import { MatrixEvent, User } from 'matrix-js-sdk';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RichPresencePublisher } from '../../src/app/hooks/useRichPresencePublisher';
import { useUserRichPresence } from '../../src/app/hooks/useUserRichPresence';
import { IDLE_AFTER_MS, IdleDetector } from '../../src/app/hooks/useIdleDetector';
import { MSC4320_RPC, MSC4320_RPC_ACTIVITY } from '../../src/types/matrix/richPresence';

// Invisible must look like offline to everyone else.

const state = vi.hoisted(() => ({
  mx: undefined as any,
  settings: {} as Record<string, unknown>,
  listeners: new Set<() => void>(),
}));
vi.mock('../../src/app/hooks/useMatrixClient', () => ({ useMatrixClient: () => state.mx }));
vi.mock('../../src/app/state/settings', () => ({ settingsAtom: 'settings' }));
vi.mock('../../src/app/state/hooks/settings', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useSetting: (_atom: unknown, key: string) => [
      useSyncExternalStore(
        (listener) => {
          state.listeners.add(listener);
          return () => state.listeners.delete(listener);
        },
        () => state.settings[key]
      ),
    ],
  };
});

const choose = async (presence: 'online' | 'unavailable' | 'offline') => {
  await act(async () => {
    state.settings = { ...state.settings, chosenPresence: presence };
    state.listeners.forEach((listener) => listener());
  });
};

let renderer: ReactTestRenderer | undefined;
let activity: (value: { name: string } | null) => void;
let alice: User;
let me: User;

beforeEach(() => {
  vi.useFakeTimers();
  state.settings = { publishRichPresence: true, idleDetection: true, chosenPresence: 'online' };
  alice = new User('@alice:example.org');
  // what the server reports: online, as while another of their devices is
  me = new User('@me:example.org');
  me.presence = 'online';
  state.mx = Object.assign(new EventEmitter(), {
    getUserId: () => '@me:example.org',
    getUser: (userId: string) => [alice, me].find((user) => user.userId === userId) ?? null,
    getAccountData: () => undefined,
    setSyncPresence: vi.fn().mockResolvedValue(undefined),
    setPresence: vi.fn().mockResolvedValue({}),
    setExtendedProfileProperty: vi.fn().mockResolvedValue(undefined),
    deleteExtendedProfileProperty: vi.fn().mockResolvedValue(undefined),
    getExtendedProfile: vi.fn().mockResolvedValue({
      [MSC4320_RPC]: { type: MSC4320_RPC_ACTIVITY, name: 'Game' },
    }),
  });
  vi.stubGlobal(
    'window',
    Object.assign(new EventTarget(), {
      pinnipedDesktop: {
        supportsRichPresenceBridge: true,
        startRichPresenceBridge: vi.fn().mockResolvedValue({ ok: true }),
        stopRichPresenceBridge: vi.fn().mockResolvedValue(undefined),
        onRichPresenceActivity: (callback: typeof activity) => {
          activity = callback;
          return vi.fn();
        },
      },
    })
  );
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const mount = async (child: React.ReactNode) => {
  await act(async () => {
    renderer = create(<Provider>{child}</Provider>);
  });
};
const advance = async (ms: number) => {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
};

describe('publishing rich presence', () => {
  it('takes it down while invisible and puts it back after', async () => {
    await mount(<RichPresencePublisher />);
    await act(async () => activity({ name: 'Game' }));
    expect(state.mx.setExtendedProfileProperty).toHaveBeenCalledTimes(1);

    await choose('offline');
    expect(state.mx.deleteExtendedProfileProperty).toHaveBeenCalledWith(MSC4320_RPC);
    // new activity and the renewals stay unpublished
    await act(async () => activity({ name: 'Other game' }));
    await advance(5 * 60_000);
    expect(state.mx.setExtendedProfileProperty).toHaveBeenCalledTimes(1);

    await choose('online');
    expect(state.mx.setExtendedProfileProperty).toHaveBeenCalledTimes(2);
    expect(state.mx.setExtendedProfileProperty.mock.lastCall[1].name).toBe('Other game');
  });

  it('publishes nothing when it starts invisible', async () => {
    state.settings.chosenPresence = 'offline';
    await mount(<RichPresencePublisher />);
    await act(async () => activity({ name: 'Game' }));
    await advance(60_000);
    expect(state.mx.setExtendedProfileProperty).not.toHaveBeenCalled();
  });
});

function Viewer() {
  const presence = useUserRichPresence(alice.userId);
  return <span>{presence?.type === 'activity' ? presence.name : 'none'}</span>;
}
const shown = () => renderer?.root.findByType('span').children;
const presenceEvent = (presence: string) =>
  new MatrixEvent({
    type: 'm.presence',
    sender: alice.userId,
    content: { presence, last_active_ago: 1000 },
  });

describe('seeing rich presence', () => {
  it('shows none for someone shown as offline, though their profile still has it', async () => {
    await mount(<Viewer />);
    expect(shown()).toEqual(['Game']);

    await act(async () => alice.setPresenceEvent(presenceEvent('offline')));
    expect(shown()).toEqual(['none']);

    await act(async () => alice.setPresenceEvent(presenceEvent('online')));
    expect(shown()).toEqual(['Game']);
  });

  it('shows it when the server tells nothing about presence', async () => {
    await mount(<Viewer />);
    expect(alice.presence).toBe('offline');
    expect(shown()).toEqual(['Game']);
  });
});

describe('idling', () => {
  it('leaves a chosen away or invisible alone, even while another device is online', async () => {
    for (const chosen of ['unavailable', 'offline'] as const) {
      state.settings.chosenPresence = chosen;
      await mount(<IdleDetector />);
      await advance(IDLE_AFTER_MS);
      expect(state.mx.setPresence).not.toHaveBeenCalled();
      act(() => renderer?.unmount());
    }
  });

  describe('in the desktop app', () => {
    let idleSeconds: number;
    beforeEach(() => {
      idleSeconds = IDLE_AFTER_MS / 1000;
      (window as any).pinnipedDesktop.getSystemIdleTime = async () => idleSeconds;
    });

    it('sends away once per idle stretch, however often the idle time is read', async () => {
      await mount(<IdleDetector />);
      await advance(60_000);
      expect(state.mx.setPresence).toHaveBeenCalledTimes(1);
    });

    it('ends away at the first input instead of at the next idle-time read', async () => {
      await mount(<IdleDetector />);
      await advance(1000);
      state.mx.setPresence.mockClear();
      await act(async () => window.dispatchEvent(new Event('keydown')));
      expect(state.mx.setPresence).toHaveBeenCalledWith(
        expect.objectContaining({ presence: 'online' })
      );
    });

    it('still sends online on return when sending away failed', async () => {
      state.mx.setPresence.mockRejectedValueOnce(new Error('offline'));
      await mount(<IdleDetector />);
      await advance(1000);
      state.mx.setPresence.mockClear();
      await act(async () => window.dispatchEvent(new Event('keydown')));
      expect(state.mx.setPresence).toHaveBeenCalledWith(
        expect.objectContaining({ presence: 'online' })
      );
    });
  });

  it('shows someone who chose online as away', async () => {
    await mount(<IdleDetector />);
    await advance(IDLE_AFTER_MS);
    expect(state.mx.setPresence).toHaveBeenCalledWith(
      expect.objectContaining({ presence: 'unavailable' })
    );
  });
});

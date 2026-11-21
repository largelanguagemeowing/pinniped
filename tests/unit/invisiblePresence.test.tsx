import React from 'react';
import { EventEmitter } from 'node:events';
import { Provider } from 'jotai';
import { User } from 'matrix-js-sdk';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_AFTER_MS, IdleDetector } from '../../src/app/hooks/useIdleDetector';

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

let renderer: ReactTestRenderer | undefined;
let me: User;

beforeEach(() => {
  vi.useFakeTimers();
  state.settings = { idleDetection: true, chosenPresence: 'online' };
  // what the server reports: online, as while another of their devices is
  me = new User('@me:example.org');
  me.presence = 'online';
  state.mx = Object.assign(new EventEmitter(), {
    getUserId: () => '@me:example.org',
    getUser: (userId: string) => (userId === me.userId ? me : null),
    getAccountData: () => undefined,
    setSyncPresence: vi.fn().mockResolvedValue(undefined),
    setPresence: vi.fn().mockResolvedValue({}),
  });
  vi.stubGlobal('window', new EventTarget());
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

  it('shows someone who chose online as away', async () => {
    await mount(<IdleDetector />);
    await advance(IDLE_AFTER_MS);
    expect(state.mx.setPresence).toHaveBeenCalledWith(
      expect.objectContaining({ presence: 'unavailable' })
    );
  });
});

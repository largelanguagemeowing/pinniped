import React from 'react';
import { EventEmitter } from 'node:events';
import { Provider } from 'jotai';
import { ClientEvent } from 'matrix-js-sdk';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RichPresencePublisher } from '../../src/app/hooks/useRichPresencePublisher';
import { useUserRichPresence } from '../../src/app/hooks/useUserRichPresence';
import {
  MSC4320_RPC,
  MSC4320_RPC_ACTIVITY,
  MSC4320_RPC_MEDIA,
  RICH_PRESENCE_EXPIRES_AT,
  RICH_PRESENCE_TTL,
  parseRichPresence,
} from '../../src/types/matrix/richPresence';

const state = vi.hoisted(() => ({ mx: undefined as any }));
vi.mock('../../src/app/hooks/useMatrixClient', () => ({ useMatrixClient: () => state.mx }));
vi.mock('../../src/app/state/settings', () => ({ settingsAtom: 'settings' }));
vi.mock('../../src/app/state/hooks/settings', () => ({ useSetting: () => [true] }));

let renderer: ReactTestRenderer | undefined;
let activity: (value: { name: string } | null) => void;
const startTime = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(startTime);
  state.mx = Object.assign(new EventEmitter(), {
    setExtendedProfileProperty: vi.fn().mockResolvedValue(undefined),
    deleteExtendedProfileProperty: vi.fn().mockResolvedValue(undefined),
    getExtendedProfile: vi.fn(),
  });
  vi.stubGlobal('window', {
    pinnipedDesktop: {
      supportsRichPresenceBridge: true,
      startRichPresenceBridge: vi.fn().mockResolvedValue({ ok: true }),
      stopRichPresenceBridge: vi.fn().mockResolvedValue(undefined),
      onRichPresenceActivity: (callback: typeof activity) => {
        activity = callback;
        return vi.fn();
      },
    },
  });
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

function Viewer() {
  const presence = useUserRichPresence('@alice:example.org');
  return <span>{presence?.type === 'activity' ? presence.name : 'none'}</span>;
}

describe('rich presence expiry', () => {
  it.each([
    { type: MSC4320_RPC_ACTIVITY, name: 'Game' },
    { type: MSC4320_RPC_MEDIA, artist: 'Artist', track: 'Track' },
  ])('expires timestamped activity but preserves legacy profiles: $type', (payload) => {
    expect(parseRichPresence(payload)).toBeDefined();
    expect(
      parseRichPresence({ ...payload, [RICH_PRESENCE_EXPIRES_AT]: startTime })
    ).toBeUndefined();
    expect(
      parseRichPresence({ ...payload, [RICH_PRESENCE_EXPIRES_AT]: startTime + 1 })
    ).toBeDefined();
  });

  it('honours an expiry published under the earlier name', () => {
    const payload = { type: MSC4320_RPC_ACTIVITY, name: 'Game' };
    expect(RICH_PRESENCE_EXPIRES_AT).toBe('club.stablecat.pinniped.expires_at');
    expect(
      parseRichPresence({ ...payload, 'de.mreow.pinniped.expires_at': startTime })
    ).toBeUndefined();
    expect(
      parseRichPresence({ ...payload, 'de.mreow.pinniped.expires_at': startTime + 1 })?.expiresAt
    ).toBe(startTime + 1);
  });

  it('renews unchanged activity each minute and stops renewing after disconnect', async () => {
    await mount(<RichPresencePublisher />);
    await act(async () => activity({ name: 'Game' }));
    expect(state.mx.setExtendedProfileProperty).toHaveBeenLastCalledWith(MSC4320_RPC, {
      type: MSC4320_RPC_ACTIVITY,
      name: 'Game',
      details: undefined,
      [RICH_PRESENCE_EXPIRES_AT]: startTime + RICH_PRESENCE_TTL,
    });
    await advance(60_000);
    expect(state.mx.setExtendedProfileProperty).toHaveBeenCalledTimes(2);
    expect(state.mx.setExtendedProfileProperty.mock.lastCall[1][RICH_PRESENCE_EXPIRES_AT]).toBe(
      startTime + 60_000 + RICH_PRESENCE_TTL
    );
    await act(async () => activity(null));
    await advance(5000);
    expect(state.mx.deleteExtendedProfileProperty).toHaveBeenCalledWith(MSC4320_RPC);
    await advance(RICH_PRESENCE_TTL);
    expect(state.mx.setExtendedProfileProperty).toHaveBeenCalledTimes(2);
  });

  it('does not lose a disconnect during an in-flight publish', async () => {
    let finish!: () => void;
    state.mx.setExtendedProfileProperty.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    await mount(<RichPresencePublisher />);
    await act(async () => activity({ name: 'Game' }));
    await act(async () => activity(null));
    await act(async () => finish());
    await advance(5000);
    expect(state.mx.deleteExtendedProfileProperty).toHaveBeenCalledWith(MSC4320_RPC);
  });

  it('hides cached activity at expiry even when profile fetches keep returning stale data', async () => {
    state.mx.getExtendedProfile.mockResolvedValue({
      [MSC4320_RPC]: {
        type: MSC4320_RPC_ACTIVITY,
        name: 'Game',
        [RICH_PRESENCE_EXPIRES_AT]: startTime + RICH_PRESENCE_TTL,
      },
    });
    await mount(<Viewer />);
    expect(renderer?.root.findByType('span').children).toEqual(['Game']);
    await advance(RICH_PRESENCE_TTL - 1);
    expect(renderer?.root.findByType('span').children).toEqual(['Game']);
    await advance(1);
    expect(renderer?.root.findByType('span').children).toEqual(['none']);
    await advance(60_000);
    expect(renderer?.root.findByType('span').children).toEqual(['none']);
  });

  it('reschedules expiry when the publisher renews the profile', async () => {
    const profile = {
      [MSC4320_RPC]: {
        type: MSC4320_RPC_ACTIVITY,
        name: 'Game',
        [RICH_PRESENCE_EXPIRES_AT]: startTime + RICH_PRESENCE_TTL,
      },
    };
    state.mx.getExtendedProfile.mockResolvedValue(profile);
    await mount(<Viewer />);
    await advance(180_000);
    profile[MSC4320_RPC][RICH_PRESENCE_EXPIRES_AT] += 180_000;
    await act(async () => {
      state.mx.emit(ClientEvent.UserProfileUpdate, '@alice:example.org', profile);
    });
    await advance(180_000);
    expect(renderer?.root.findByType('span').children).toEqual(['Game']);
    await advance(120_000);
    expect(renderer?.root.findByType('span').children).toEqual(['none']);
  });
});

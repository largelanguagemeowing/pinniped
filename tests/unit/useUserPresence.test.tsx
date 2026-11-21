import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { MatrixClient, MatrixEvent, User } from 'matrix-js-sdk';
import { describe, expect, it } from 'vitest';
import { MatrixClientProvider } from '../../src/app/hooks/useMatrixClient';
import { Presence, UserPresence, useUserPresence } from '../../src/app/hooks/useUserPresence';

const alice = new User('@alice:example.org');
alice.presence = Presence.Online;
alice.presenceStatusMsg = 'building things';
alice.lastActiveAgo = 1000;
alice.lastPresenceTs = 5000;

const bob = new User('@bob:example.org');
bob.presence = Presence.Offline;
bob.lastActiveAgo = 3000;
bob.lastPresenceTs = 9000;

const users: Record<string, User> = { [alice.userId]: alice, [bob.userId]: bob };
const mx = { getUser: (userId: string) => users[userId] ?? null } as unknown as MatrixClient;

describe('useUserPresence', () => {
  it('shows the presence of the user matching the current userId', () => {
    let renderer!: ReactTestRenderer;
    let result: UserPresence | undefined;

    function Harness({ userId }: { userId: string }) {
      result = useUserPresence(userId);
      return null;
    }

    act(() => {
      renderer = create(
        <MatrixClientProvider value={mx}>
          <Harness userId={alice.userId} />
        </MatrixClientProvider>
      );
    });
    expect(result).toMatchObject({ presence: Presence.Online, status: 'building things' });

    // A virtualized DM list row is keyed by index, not room: when the list
    // reorders, the same component instance rebinds to another room (and thus
    // to another user). The hook must not keep showing the previous user.
    act(() => {
      renderer.update(
        <MatrixClientProvider value={mx}>
          <Harness userId={bob.userId} />
        </MatrixClientProvider>
      );
    });
    expect(result).toMatchObject({ presence: Presence.Offline });
  });

  it('resolves presence as soon as the user becomes known, without waiting for an event', () => {
    let renderer!: ReactTestRenderer;
    let result: UserPresence | undefined;

    function Harness({ userId }: { userId: string }) {
      result = useUserPresence(userId);
      return null;
    }

    const unknown = '@carol:example.org';
    const carol = new User(unknown);
    carol.presence = Presence.Unavailable;
    carol.lastActiveAgo = 500;
    carol.lastPresenceTs = 2000;

    act(() => {
      renderer = create(
        <MatrixClientProvider value={mx}>
          <Harness userId={unknown} />
        </MatrixClientProvider>
      );
    });
    expect(result).toBeUndefined();

    // The SDK store learns about carol later (e.g. first sync); mx.getUser
    // starts returning her User object. The hook must pick it up right away.
    users[unknown] = carol;
    act(() => {
      renderer.update(
        <MatrixClientProvider value={mx}>
          <Harness userId={unknown} />
        </MatrixClientProvider>
      );
    });
    expect(result).toMatchObject({ presence: Presence.Unavailable });

    // Emitting a Presence event for the user keeps updating the hook.
    act(() => {
      carol.setPresenceEvent({
        getType: () => 'm.presence',
        getContent: () => ({ presence: Presence.Online, status_msg: 'at lunch' }),
      } as unknown as Parameters<User['setPresenceEvent']>[0]);
    });
    expect(result).toMatchObject({ presence: Presence.Online, status: 'at lunch' });
  });

  // patches/matrix-js-sdk: servers leave an empty status_msg out of the presence event
  it('clears a status message once a presence event comes without one', () => {
    const dave = new User('@dave:example.org');
    users[dave.userId] = dave;
    const presenceEvent = (content: Record<string, unknown>) =>
      new MatrixEvent({ type: 'm.presence', sender: dave.userId, content });
    let result: UserPresence | undefined;
    function Harness() {
      result = useUserPresence(dave.userId);
      return null;
    }

    act(() => {
      dave.setPresenceEvent(presenceEvent({ presence: Presence.Online, status_msg: 'at lunch' }));
      create(
        <MatrixClientProvider value={mx}>
          <Harness />
        </MatrixClientProvider>
      );
    });
    expect(result).toMatchObject({ presence: Presence.Online, status: 'at lunch' });

    act(() => {
      dave.setPresenceEvent(presenceEvent({ presence: Presence.Online, last_active_ago: 10 }));
    });
    expect(result?.status).toBeUndefined();
  });
});

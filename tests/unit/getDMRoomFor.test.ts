import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import { addRoomIdToMDirect, getDMRoomFor } from '../../src/app/utils/matrix';

const BOB = '@bob:example.org';
const CAROL = '@carol:example.org';

type FakeRoom = { roomId: string; membership: string; encrypted?: boolean; memberCount?: number };

const client = (direct: unknown, rooms: FakeRoom[]) => {
  const byId = new Map(
    rooms.map((r) => [
      r.roomId,
      {
        roomId: r.roomId,
        getMyMembership: () => r.membership,
        hasEncryptionStateEvent: () => r.encrypted ?? true,
        getMembers: () => new Array(r.memberCount ?? 2),
        getMember: () => ({}),
      },
    ])
  );
  const setAccountData = vi.fn(async () => ({}));
  const mx = {
    getAccountData: () => (direct === undefined ? undefined : { getContent: () => direct }),
    getRoom: (id: string) => byId.get(id) ?? null,
    getRooms: () => [...byId.values()],
    setAccountData,
  };
  return { mx: mx as unknown as MatrixClient, setAccountData };
};

describe('getDMRoomFor', () => {
  it('returns the joined room m.direct lists for the user', () => {
    const { mx } = client({ [BOB]: ['!dm:x'] }, [{ roomId: '!dm:x', membership: 'join' }]);

    expect(getDMRoomFor(mx, BOB)?.roomId).toBe('!dm:x');
  });

  it('ignores a small encrypted room that m.direct does not list', () => {
    // lazy-loaded members make a big group look like two people
    const { mx } = client({}, [{ roomId: '!group:x', membership: 'join', memberCount: 1 }]);

    expect(getDMRoomFor(mx, BOB)).toBeUndefined();
  });

  it('does not return a DM listed for someone else', () => {
    const { mx } = client({ [CAROL]: ['!dm:x'] }, [{ roomId: '!dm:x', membership: 'join' }]);

    expect(getDMRoomFor(mx, BOB)).toBeUndefined();
  });

  it('skips listed rooms we left or never had, and takes the next joined one', () => {
    const { mx } = client({ [BOB]: ['!left:x', '!unknown:x', '!dm:x'] }, [
      { roomId: '!left:x', membership: 'leave' },
      { roomId: '!dm:x', membership: 'join' },
    ]);

    expect(getDMRoomFor(mx, BOB)?.roomId).toBe('!dm:x');
  });

  it('finds an unencrypted DM too', () => {
    const { mx } = client({ [BOB]: ['!dm:x'] }, [
      { roomId: '!dm:x', membership: 'join', encrypted: false },
    ]);

    expect(getDMRoomFor(mx, BOB)?.roomId).toBe('!dm:x');
  });

  it.each([undefined, {}, { [BOB]: 'not-a-list' }, { [BOB]: [1, null, {}] }])(
    'tolerates malformed m.direct %j',
    (direct) => {
      const { mx } = client(direct, [{ roomId: '!dm:x', membership: 'join' }]);

      expect(getDMRoomFor(mx, BOB)).toBeUndefined();
    }
  );
});

describe('addRoomIdToMDirect', () => {
  it('replaces a non-array entry instead of throwing', async () => {
    const { mx, setAccountData } = client({ [BOB]: 'junk', [CAROL]: 7 }, []);

    await addRoomIdToMDirect(mx, '!new:x', BOB);

    expect(setAccountData).toHaveBeenCalledWith('m.direct', { [BOB]: ['!new:x'], [CAROL]: 7 });
  });
});

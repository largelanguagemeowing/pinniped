import { describe, expect, it, vi } from 'vitest';
import { MatrixClient } from 'matrix-js-sdk';
import { AccountDataEvent } from '../../src/types/matrix/accountData';
import { createRoomMarks } from '../../src/app/state/roomMarks';

const fakeClient = (initial: Record<string, number> = {}) => {
  let rooms = initial;
  const setAccountData = vi.fn(
    async (_type: string, content: { rooms: Record<string, number> }) => {
      rooms = content.rooms;
    }
  );
  const mx = {
    getAccountData: () => ({ getContent: () => ({ rooms }) }),
    setAccountData,
  } as unknown as MatrixClient;
  return { mx, setAccountData, stored: () => rooms };
};

describe('createRoomMarks', () => {
  const marks = createRoomMarks(AccountDataEvent.PinnipedAutoJoinSettled);

  it('serialises concurrent marks so none is lost', async () => {
    const { mx, stored } = fakeClient();
    await Promise.all([marks.mark(mx, ['!a:x']), marks.mark(mx, ['!b:x'])]);
    expect(Object.keys(stored()).sort()).toEqual(['!a:x', '!b:x']);
  });

  it('does not write when every room is already marked', async () => {
    const { mx, setAccountData } = fakeClient({ '!a:x': 1 });
    await marks.mark(mx, ['!a:x']);
    expect(setAccountData).not.toHaveBeenCalled();
  });

  it('keeps the original timestamp of a mark', async () => {
    const { mx, stored } = fakeClient({ '!a:x': 1 });
    await marks.mark(mx, ['!a:x', '!b:x']);
    expect(stored()['!a:x']).toBe(1);
  });

  it('unmarks rooms', async () => {
    const { mx, stored } = fakeClient({ '!a:x': 1, '!b:x': 2 });
    await marks.unmark(mx, ['!a:x']);
    expect(Object.keys(stored())).toEqual(['!b:x']);
  });

  it('ignores malformed stored entries', () => {
    const mx = {
      getAccountData: () => ({ getContent: () => ({ rooms: { '!a:x': 'bad', '!b:x': 2 } }) }),
    } as unknown as MatrixClient;
    expect(marks.get(mx)).toEqual({ '!b:x': 2 });
  });
});

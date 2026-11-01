import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, EventType, MatrixEvent, ReceiptType, Room } from 'matrix-js-sdk';

const ME = '@me:x';
const OTHER = '@other:x';

const makeStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  };
};

const makeRoom = () => {
  const client = createClient({ baseUrl: 'https://x.invalid', userId: ME, accessToken: 't' });
  const room = new Room('!r:x', client, ME);
  return { room, client };
};

const msg = (id: string, sender: string, ts: number) =>
  new MatrixEvent({
    event_id: id,
    sender,
    type: EventType.RoomMessage,
    content: { msgtype: 'm.text', body: id },
    origin_server_ts: ts,
    room_id: '!r:x',
  });

const receipt = (eventId: string, type: ReceiptType, ts: number, user = ME) =>
  new MatrixEvent({
    type: 'm.receipt',
    room_id: '!r:x',
    content: { [eventId]: { [type]: { [user]: { ts } } } },
  });

const load = async () => {
  vi.resetModules();
  vi.stubGlobal('window', { localStorage: makeStorage() });
  const notifications = await import('../../src/app/utils/notifications');
  const roomUtils = await import('../../src/app/utils/room');
  const markers = await import('../../src/app/state/readMarkers');
  return { ...notifications, ...roomUtils, ...markers };
};

const setup = (events: MatrixEvent[]) => {
  const { room, client } = makeRoom();
  room.addLiveEvents(events, { addToState: false } as any);
  const send = vi.spyOn(client, 'sendReadReceipt').mockImplementation(async (ev, type) => {
    // the SDK records a local echo as soon as a receipt is sent
    room.addReceipt(receipt(ev!.getId()!, (type ?? ReceiptType.Read) as ReceiptType, 1000), true);
    return {};
  });
  return { room, client, send };
};

describe('roomHaveUnread', () => {
  it('is unread with no receipt and a message from someone else', async () => {
    const { roomHaveUnread } = await load();
    const { room, client } = setup([msg('$1', OTHER, 1)]);
    expect(roomHaveUnread(client, room)).toBe(true);
  });

  it('is read when the receipt is on the latest message', async () => {
    const { roomHaveUnread } = await load();
    const { room, client } = setup([msg('$1', OTHER, 1), msg('$2', OTHER, 2)]);
    room.addReceipt(receipt('$2', ReceiptType.Read, 5));
    expect(roomHaveUnread(client, room)).toBe(false);
  });

  it('is unread when the receipt sits on an older message (a mention) and newer ones followed', async () => {
    const { roomHaveUnread } = await load();
    const { room, client } = setup([
      msg('$mention', OTHER, 1),
      msg('$2', OTHER, 2),
      msg('$3', OTHER, 3),
    ]);
    room.addReceipt(receipt('$mention', ReceiptType.Read, 1));
    expect(roomHaveUnread(client, room)).toBe(true);
  });

  it('is read when the last message is our own', async () => {
    const { roomHaveUnread } = await load();
    const { room, client } = setup([msg('$1', OTHER, 1), msg('$2', ME, 2)]);
    expect(roomHaveUnread(client, room)).toBe(false);
  });

  it('honours a private receipt', async () => {
    const { roomHaveUnread } = await load();
    const { room, client } = setup([msg('$1', OTHER, 1), msg('$2', OTHER, 2)]);
    room.addReceipt(receipt('$2', ReceiptType.ReadPrivate, 5));
    expect(roomHaveUnread(client, room)).toBe(false);
  });

  it('uses the receipt timestamp when its event is not loaded (after restart)', async () => {
    const { roomHaveUnread } = await load();
    const { room, client } = setup([msg('$1', OTHER, 10), msg('$2', OTHER, 20)]);
    room.addReceipt(receipt('$gone', ReceiptType.Read, 25));
    expect(roomHaveUnread(client, room)).toBe(false);
    room.addLiveEvents([msg('$3', OTHER, 30)], { addToState: false } as any);
    expect(roomHaveUnread(client, room)).toBe(true);
  });

  it('counts a newer event as unread even when its timestamp ties the read one', async () => {
    const { roomHaveUnread } = await load();
    const { room, client } = setup([msg('$1', OTHER, 1000), msg('$2', OTHER, 1000)]);
    room.addReceipt(receipt('$1', ReceiptType.Read, 1000));
    expect(roomHaveUnread(client, room)).toBe(true);
  });

  it('falls back on the locally remembered read time', async () => {
    const { roomHaveUnread, rememberLocalReadTs } = await load();
    const { room, client } = setup([msg('$1', OTHER, 10)]);
    expect(roomHaveUnread(client, room)).toBe(true);
    rememberLocalReadTs('!r:x', 10);
    expect(roomHaveUnread(client, room)).toBe(false);
  });

  it('ignores non-notifying events such as membership changes', async () => {
    const { roomHaveUnread } = await load();
    const { room, client } = setup([
      msg('$1', OTHER, 1),
      new MatrixEvent({
        event_id: '$m',
        sender: OTHER,
        type: EventType.RoomMember,
        state_key: OTHER,
        content: { membership: 'join' },
        origin_server_ts: 2,
        room_id: '!r:x',
      }),
    ]);
    room.addReceipt(receipt('$1', ReceiptType.Read, 5));
    expect(roomHaveUnread(client, room)).toBe(false);
  });
});

describe('markAsRead', () => {
  let ctx: Awaited<ReturnType<typeof load>>;
  beforeEach(async () => {
    ctx = await load();
  });

  it('sends a public receipt for the latest event', async () => {
    const { room, client, send } = setup([msg('$1', OTHER, 1), msg('$2', OTHER, 2)]);
    vi.spyOn(client, 'getRoom').mockReturnValue(room);
    await ctx.markAsRead(client, '!r:x', false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].getId()).toBe('$2');
    expect(send.mock.calls[0][1]).toBe(ReceiptType.Read);
  });

  it('sends a private receipt when activity is hidden', async () => {
    const { room, client, send } = setup([msg('$1', OTHER, 1)]);
    vi.spyOn(client, 'getRoom').mockReturnValue(room);
    await ctx.markAsRead(client, '!r:x', true);
    expect(send.mock.calls[0][1]).toBe(ReceiptType.ReadPrivate);
  });

  it('does not resend once the server has the receipt', async () => {
    const { room, client, send } = setup([msg('$1', OTHER, 1)]);
    vi.spyOn(client, 'getRoom').mockReturnValue(room);
    await ctx.markAsRead(client, '!r:x', false);
    await ctx.markAsRead(client, '!r:x', false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries after a failed send even though the SDK echoed the receipt locally', async () => {
    const { room, client, send } = setup([msg('$1', OTHER, 1)]);
    vi.spyOn(client, 'getRoom').mockReturnValue(room);
    send.mockImplementationOnce(async (ev, type) => {
      room.addReceipt(receipt(ev!.getId()!, type as ReceiptType, 1000), true);
      throw new Error('network');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await ctx.markAsRead(client, '!r:x', false);
    await ctx.markAsRead(client, '!r:x', false);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('advances the receipt when a newer message arrives', async () => {
    const { room, client, send } = setup([msg('$1', OTHER, 1)]);
    vi.spyOn(client, 'getRoom').mockReturnValue(room);
    await ctx.markAsRead(client, '!r:x', false);
    room.addLiveEvents([msg('$2', OTHER, 2)], { addToState: false } as any);
    await ctx.markAsRead(client, '!r:x', false);
    expect(send.mock.calls.map((c) => c[0].getId())).toEqual(['$1', '$2']);
  });

  it('moves a receipt stuck on a mention up to the latest event', async () => {
    const { room, client, send } = setup([
      msg('$mention', OTHER, 1),
      msg('$2', OTHER, 2),
      msg('$3', OTHER, 3),
    ]);
    vi.spyOn(client, 'getRoom').mockReturnValue(room);
    room.addReceipt(receipt('$mention', ReceiptType.Read, 1));
    await ctx.markAsRead(client, '!r:x', false);
    expect(send.mock.calls[0][0].getId()).toBe('$3');
  });

  it('remembers the read time so the room stays read across a restart', async () => {
    const { room, client } = setup([msg('$1', OTHER, 7)]);
    vi.spyOn(client, 'getRoom').mockReturnValue(room);
    await ctx.markAsRead(client, '!r:x', false);
    expect(ctx.getLocalReadTs('!r:x')).toBe(7);
  });

  it('does nothing for an unknown or empty room', async () => {
    const { room, client, send } = setup([]);
    vi.spyOn(client, 'getRoom').mockReturnValueOnce(null).mockReturnValue(room);
    await ctx.markAsRead(client, '!r:x', false);
    await ctx.markAsRead(client, '!r:x', false);
    expect(send).not.toHaveBeenCalled();
  });

  it('skips events still being sent', async () => {
    const { room, client, send } = setup([msg('$1', OTHER, 1)]);
    const pending = msg('$2', ME, 2);
    pending.setStatus('sending' as any);
    room
      .getLiveTimeline()
      .addEvent(pending, { toStartOfTimeline: false, addToState: false } as any);
    vi.spyOn(client, 'getRoom').mockReturnValue(room);
    await ctx.markAsRead(client, '!r:x', false);
    expect(send.mock.calls[0][0].getId()).toBe('$1');
  });
});

describe('getRoomUnreadInfo (where the timeline opens)', () => {
  const stuckOnMention = () =>
    setup([msg('$mention', OTHER, 1), msg('$2', OTHER, 2), msg('$3', OTHER, 3)]);

  it('has no marker for a room with no receipt at all', async () => {
    const { getRoomUnreadInfo } = await load();
    const { room, client } = setup([msg('$1', OTHER, 1)]);
    expect(getRoomUnreadInfo(client, room, true)).toBeUndefined();
  });

  it('points at the receipt for a genuinely unread room', async () => {
    const { getRoomUnreadInfo } = await load();
    const { room, client } = stuckOnMention();
    room.addReceipt(receipt('$mention', ReceiptType.Read, 1));
    expect(getRoomUnreadInfo(client, room, true)).toMatchObject({
      readUptoEventId: '$mention',
      inLiveTimeline: true,
      scrollTo: true,
    });
  });

  it('does not jump to a stale receipt when the room was already marked read', async () => {
    // The server never echoed a newer receipt, but we did mark it read at ts 3.
    const { getRoomUnreadInfo, roomHaveUnread, rememberLocalReadTs } = await load();
    const { room, client } = stuckOnMention();
    room.addReceipt(receipt('$mention', ReceiptType.Read, 1));
    rememberLocalReadTs('!r:x', 3);
    expect(roomHaveUnread(client, room)).toBe(false);
    expect(getRoomUnreadInfo(client, room, true)).toBeUndefined();
  });

  it('does not jump to a stale receipt when the last message is our own', async () => {
    const { getRoomUnreadInfo } = await load();
    const { room, client } = setup([msg('$mention', OTHER, 1), msg('$2', OTHER, 2)]);
    room.addReceipt(receipt('$mention', ReceiptType.Read, 1));
    room.addLiveEvents([msg('$mine', ME, 3)], { addToState: false } as any);
    expect(getRoomUnreadInfo(client, room, true)).toBeUndefined();
  });
});

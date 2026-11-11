import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient, EventType, MatrixEvent, ReceiptType, Room } from 'matrix-js-sdk';
import {
  TimelineUnreadInfo,
  useTimelineUnreadInfo,
} from '../../src/app/hooks/useTimelineUnreadInfo';
import { markAsRead } from '../../src/app/utils/notifications';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ME = '@me:x';
const OTHER = '@other:x';

const msg = (id: string, sender: string, ts: number) =>
  new MatrixEvent({
    event_id: id,
    sender,
    type: EventType.RoomMessage,
    content: { msgtype: 'm.text', body: id },
    origin_server_ts: ts,
  });

const receipt = (eventId: string, type: ReceiptType, user: string) =>
  new MatrixEvent({
    type: 'm.receipt',
    content: { [eventId]: { [type]: { [user]: { ts: 1000 } } } },
  });

// the remembered read time is kept per room id for the whole run; a room per test keeps them apart
let rooms = 0;

// A room read up to $1, with no unread badge state anywhere: the hook must not need one.
const setup = (events: MatrixEvent[]) => {
  const client = createClient({ baseUrl: 'https://x.invalid', userId: ME, accessToken: 't' });
  rooms += 1;
  const room = new Room(`!r${rooms}:x`, client, ME);
  room.addLiveEvents(events, { addToState: false } as any);
  room.addReceipt(receipt('$1', ReceiptType.Read, ME));
  vi.spyOn(client, 'getRoom').mockReturnValue(room);
  vi.spyOn(client, 'sendReadReceipt').mockImplementation(async (ev, type) => {
    // the SDK records a local echo as soon as a receipt is sent
    room.addReceipt(receipt(ev!.getId()!, (type ?? ReceiptType.Read) as ReceiptType, ME), true);
    return {};
  });
  return { room, client };
};

const arrive = (room: Room, event: MatrixEvent) =>
  room.addLiveEvents([event], { addToState: false } as any);

describe('useTimelineUnreadInfo', () => {
  let r: ReactTestRenderer;
  let unreadInfo: TimelineUnreadInfo | undefined;
  let trackUnread: () => void;

  const mount = (room: Room, client: ReturnType<typeof createClient>) => {
    function Probe() {
      [unreadInfo, trackUnread] = useTimelineUnreadInfo(client, room);
      return null;
    }
    act(() => {
      r = create(<Probe />);
    });
  };

  afterEach(() => {
    act(() => r.unmount());
    vi.restoreAllMocks();
  });

  it('opens an unread room at the read receipt', () => {
    const { room, client } = setup([msg('$1', OTHER, 1), msg('$2', OTHER, 2)]);
    mount(room, client);
    expect(unreadInfo).toMatchObject({ readUptoEventId: '$1', scrollTo: true });
  });

  it('has nothing to show for a room that is read', () => {
    const { room, client } = setup([msg('$1', OTHER, 1)]);
    mount(room, client);
    expect(unreadInfo).toBeUndefined();
  });

  it('tracks a message that arrives unseen, without asking the timeline to scroll', () => {
    const { room, client } = setup([msg('$1', OTHER, 1)]);
    mount(room, client);
    arrive(room, msg('$2', OTHER, 2));
    act(() => trackUnread());
    expect(unreadInfo).toMatchObject({ readUptoEventId: '$1', scrollTo: false });
  });

  it('keeps pointing at where the unseen messages began', () => {
    const { room, client } = setup([msg('$1', OTHER, 1)]);
    mount(room, client);
    arrive(room, msg('$2', OTHER, 2));
    act(() => trackUnread());
    const first = unreadInfo;
    arrive(room, msg('$3', OTHER, 3));
    act(() => trackUnread());
    expect(unreadInfo).toBe(first);
  });

  it('is dropped once the room is marked read', async () => {
    const { room, client } = setup([msg('$1', OTHER, 1)]);
    mount(room, client);
    arrive(room, msg('$2', OTHER, 2));
    act(() => trackUnread());
    await act(() => markAsRead(client, room.roomId, false));
    expect(unreadInfo).toBeUndefined();
  });

  it('is dropped by a private receipt too', async () => {
    const { room, client } = setup([msg('$1', OTHER, 1)]);
    mount(room, client);
    arrive(room, msg('$2', OTHER, 2));
    act(() => trackUnread());
    await act(() => markAsRead(client, room.roomId, true));
    expect(unreadInfo).toBeUndefined();
  });

  it('starts over at the new receipt for messages that arrive after the room was read', async () => {
    const { room, client } = setup([msg('$1', OTHER, 1)]);
    mount(room, client);
    arrive(room, msg('$2', OTHER, 2));
    act(() => trackUnread());
    await act(() => markAsRead(client, room.roomId, false));
    arrive(room, msg('$3', OTHER, 3));
    act(() => trackUnread());
    expect(unreadInfo).toMatchObject({ readUptoEventId: '$2' });
  });

  it("is dropped by a receipt of ours that another device sent, but not by someone else's", () => {
    const { room, client } = setup([msg('$1', OTHER, 1), msg('$2', OTHER, 2)]);
    mount(room, client);
    act(() => room.addReceipt(receipt('$2', ReceiptType.Read, OTHER)));
    expect(unreadInfo).toMatchObject({ readUptoEventId: '$1' });
    act(() => room.addReceipt(receipt('$2', ReceiptType.Read, ME)));
    expect(unreadInfo).toBeUndefined();
  });
});

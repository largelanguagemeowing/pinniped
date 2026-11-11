import { useCallback, useEffect, useState } from 'react';
import { MatrixClient, Room, RoomEvent, RoomEventHandlerMap } from 'matrix-js-sdk';
import { getRoomUnreadInfo, receiptIncludesUser } from '../utils/room';

export type TimelineUnreadInfo = NonNullable<ReturnType<typeof getRoomUnreadInfo>>;

/**
 * Where the unread messages of an open room begin: taken from the read receipt
 * when the room opens and when a message arrives unseen, and dropped by our next
 * read receipt. It follows the room's receipts only, not the unread badge, which
 * a muted room never has.
 */
export const useTimelineUnreadInfo = (
  mx: MatrixClient,
  room: Room
): [TimelineUnreadInfo | undefined, () => void] => {
  const [unreadInfo, setUnreadInfo] = useState(() => getRoomUnreadInfo(mx, room, true));

  useEffect(() => {
    const handleReceipt: RoomEventHandlerMap[RoomEvent.Receipt] = (mEvent) => {
      const userId = mx.getUserId();
      if (userId && receiptIncludesUser(mEvent, userId)) setUnreadInfo(undefined);
    };
    room.on(RoomEvent.Receipt, handleReceipt);
    return () => {
      room.removeListener(RoomEvent.Receipt, handleReceipt);
    };
  }, [mx, room]);

  // keeps the marker where the unseen messages began; later arrivals do not move it
  const trackUnread = useCallback(() => {
    const info = getRoomUnreadInfo(mx, room);
    setUnreadInfo((current) => current ?? info);
  }, [mx, room]);

  return [unreadInfo, trackUnread];
};

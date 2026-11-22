import { MatrixClient, RoomEvent, RoomEventHandlerMap } from 'matrix-js-sdk';
import { useEffect, useState } from 'react';
import { compareRoomsEqual } from '../state/room-list/utils';
import { factoryRoomIdByActivity } from '../utils/sort';

const sortByActivity = (mx: MatrixClient, roomIds: string[]): string[] =>
  [...roomIds].sort(factoryRoomIdByActivity(mx));

/**
 * `roomIds` ordered by last activity, newest first. The order follows the rooms' live
 * timelines, so a room moves up when an event lands in it; a render happens only when the
 * order actually changes.
 */
export const useRoomsByActivity = (mx: MatrixClient, roomIds: string[]): string[] => {
  const [order, setOrder] = useState(() => sortByActivity(mx, roomIds));
  const [orderedFrom, setOrderedFrom] = useState(roomIds);
  if (orderedFrom !== roomIds) {
    // the set of rooms changed; resort during this render so no stale order is committed
    setOrderedFrom(roomIds);
    setOrder(sortByActivity(mx, roomIds));
  }

  useEffect(() => {
    const members = new Set(roomIds);
    const handleTimeline: RoomEventHandlerMap[RoomEvent.Timeline] = (
      event,
      room,
      toStartOfTimeline
    ) => {
      // backfilled history is older than the room's last activity
      if (toStartOfTimeline || !room || !members.has(room.roomId)) return;
      setOrder((current) => {
        const next = sortByActivity(mx, roomIds);
        return compareRoomsEqual(current, next) ? current : next;
      });
    };

    mx.on(RoomEvent.Timeline, handleTimeline);
    return () => {
      mx.removeListener(RoomEvent.Timeline, handleTimeline);
    };
  }, [mx, roomIds]);

  return order;
};

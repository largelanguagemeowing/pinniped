import { useMemo } from 'react';
import { RoomPinnedEventsEventContent } from 'matrix-js-sdk/lib/types';
import { Room } from 'matrix-js-sdk';
import { StateEvent } from '../../types/matrix/room';
import { useStateEvent } from './useStateEvent';

export const useRoomPinnedEvents = (room: Room): string[] => {
  const pinEvent = useStateEvent(room, StateEvent.RoomPinnedEvents);
  const events = useMemo(() => {
    const content = pinEvent?.getContent<RoomPinnedEventsEventContent>();
    const pinned: unknown = content?.pinned;
    // any member with the power to pin can store any shape here
    return Array.isArray(pinned) ? pinned.filter((id): id is string => typeof id === 'string') : [];
  }, [pinEvent]);

  return events;
};

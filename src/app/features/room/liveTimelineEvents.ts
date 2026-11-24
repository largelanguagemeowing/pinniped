import { useEffect } from 'react';
import {
  type EventTimelineSetHandlerMap,
  type MatrixEvent,
  type Room,
  RoomEvent,
  type RoomEventHandlerMap,
} from 'matrix-js-sdk';

export const useLiveEventArrive = (room: Room, onArrive: (mEvent: MatrixEvent) => void) => {
  useEffect(() => {
    const handleTimelineEvent: EventTimelineSetHandlerMap[RoomEvent.Timeline] = (
      mEvent,
      eventRoom,
      toStartOfTimeline,
      removed,
      data
    ) => {
      if (eventRoom?.roomId !== room.roomId || !data.liveEvent) return;
      onArrive(mEvent);
    };

    room.on(RoomEvent.Timeline, handleTimelineEvent);
    return () => {
      room.removeListener(RoomEvent.Timeline, handleTimelineEvent);
    };
  }, [room, onArrive]);
};

// A redaction changes an event already in the chain; the redaction event itself arrives (and is
// counted) through RoomEvent.Timeline, so this only re-renders.
export const useRedactionRerender = (room: Room, onRedaction: () => void) => {
  useEffect(() => {
    const handleRedaction: RoomEventHandlerMap[RoomEvent.Redaction] = (mEvent, eventRoom) => {
      if (eventRoom?.roomId !== room.roomId) return;
      onRedaction();
    };

    room.on(RoomEvent.Redaction, handleRedaction);
    return () => {
      room.removeListener(RoomEvent.Redaction, handleRedaction);
    };
  }, [room, onRedaction]);
};

// Both a history import (TimelineRefresh) and a sync gap (TimelineReset of the room's own
// timeline set; thread sets re-emit it too) leave the open window on a detached chain.
export const useLiveTimelineRefresh = (room: Room, onRefresh: () => void) => {
  useEffect(() => {
    const handleTimelineRefresh: RoomEventHandlerMap[RoomEvent.TimelineRefresh] = (r) => {
      if (r.roomId !== room.roomId) return;
      onRefresh();
    };
    const handleTimelineReset: RoomEventHandlerMap[RoomEvent.TimelineReset] = (
      eventRoom,
      timelineSet
    ) => {
      if (eventRoom?.roomId !== room.roomId || timelineSet !== room.getUnfilteredTimelineSet()) {
        return;
      }
      onRefresh();
    };

    room.on(RoomEvent.TimelineRefresh, handleTimelineRefresh);
    room.on(RoomEvent.TimelineReset, handleTimelineReset);
    return () => {
      room.removeListener(RoomEvent.TimelineRefresh, handleTimelineRefresh);
      room.removeListener(RoomEvent.TimelineReset, handleTimelineReset);
    };
  }, [room, onRefresh]);
};

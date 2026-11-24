import { useEffect } from 'react';
import { RoomEvent, type MatrixClient, type Room } from 'matrix-js-sdk';

/**
 * Calls `onRedacted` once the event `eventId` is redacted, also when that happened before this
 * subscribed (a sync delivers a ring and its redaction together); does nothing without an id.
 */
export const useRedactionDismiss = (
  mx: Pick<MatrixClient, 'on' | 'removeListener'>,
  room: Pick<Room, 'findEventById'> | undefined,
  eventId: string | undefined,
  onRedacted: () => void
) => {
  useEffect(() => {
    if (!eventId) return undefined;
    const handleRedaction = (redaction: { getAssociatedId(): string | undefined }) => {
      if (redaction.getAssociatedId() === eventId) onRedacted();
    };
    mx.on(RoomEvent.Redaction, handleRedaction);
    if (room?.findEventById(eventId)?.isRedacted()) onRedacted();
    return () => {
      mx.removeListener(RoomEvent.Redaction, handleRedaction);
    };
  }, [mx, room, eventId, onRedacted]);
};

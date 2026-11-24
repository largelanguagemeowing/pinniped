import { useEffect } from 'react';
import { RoomEvent, type MatrixClient } from 'matrix-js-sdk';

/** Calls `onRedacted` once the event `eventId` is redacted; does nothing without an id. */
export const useRedactionDismiss = (
  mx: Pick<MatrixClient, 'on' | 'removeListener'>,
  eventId: string | undefined,
  onRedacted: () => void
) => {
  useEffect(() => {
    if (!eventId) return undefined;
    const handleRedaction = (redaction: { getAssociatedId(): string | undefined }) => {
      if (redaction.getAssociatedId() === eventId) onRedacted();
    };
    mx.on(RoomEvent.Redaction, handleRedaction);
    return () => {
      mx.removeListener(RoomEvent.Redaction, handleRedaction);
    };
  }, [mx, eventId, onRedacted]);
};

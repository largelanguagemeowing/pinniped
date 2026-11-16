import { useEffect } from 'react';
import { MatrixEvent, MatrixEventEvent, type Room } from 'matrix-js-sdk';

// An encrypted relation (reaction, edit) is only aggregated once decrypted, long after its
// timeline event fired. The first one for a message creates the Relations collection silently,
// so nothing re-renders the message; aggregate here (the SDK dedups) and report when done.
export const useDecryptedRelation = (room: Room, onAggregated: (relation: MatrixEvent) => void) => {
  useEffect(() => {
    const { client } = room;
    const handleDecrypted = (event: MatrixEvent) => {
      if (event.getRoomId() !== room.roomId || event.isDecryptionFailure()) return;
      const targetId = event.getRelation()?.event_id;
      const target = targetId ? room.findEventById(targetId) : undefined;
      if (!target) return;

      const timelineSet = room.getUnfilteredTimelineSet();
      timelineSet.relations
        .aggregateChildEvent(event, timelineSet, target)
        .then(() => onAggregated(event))
        .catch(() => undefined);
    };

    client.on(MatrixEventEvent.Decrypted, handleDecrypted);
    return () => {
      client.removeListener(MatrixEventEvent.Decrypted, handleDecrypted);
    };
  }, [room, onAggregated]);
};

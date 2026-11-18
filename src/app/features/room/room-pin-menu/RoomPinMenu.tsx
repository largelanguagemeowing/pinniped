import React, { forwardRef, useCallback, useMemo } from 'react';
import { Room } from 'matrix-js-sdk';
import { RoomPinnedEventsEventContent } from 'matrix-js-sdk/lib/types';
import { Icons } from 'folds';
import { useRoomPinnedEvents } from '../../../hooks/useRoomPinnedEvents';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { getStateEvent } from '../../../utils/room';
import { StateEvent } from '../../../../types/matrix/room';
import { usePowerLevelsContext } from '../../../hooks/usePowerLevels';
import { useRoomCreators } from '../../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../../hooks/useRoomPermissions';
import { MessageListMenu } from '../message-list-menu';

type RoomPinMenuProps = {
  room: Room;
  requestClose: () => void;
};
export const RoomPinMenu = forwardRef<HTMLDivElement, RoomPinMenuProps>(
  ({ room, requestClose }, ref) => {
    const mx = useMatrixClient();
    const powerLevels = usePowerLevelsContext();
    const creators = useRoomCreators(room);
    const permissions = useRoomPermissions(creators, powerLevels);
    const canPinEvent = permissions.stateEvent(StateEvent.RoomPinnedEvents, mx.getSafeUserId());

    const pinnedEvents = useRoomPinnedEvents(room);
    const newestFirst = useMemo(() => Array.from(pinnedEvents).reverse(), [pinnedEvents]);

    const unpin = useCallback(
      (eventId: string) => {
        // read the newest state, not the rendered list, so concurrent unpins are kept
        const pinEvent = getStateEvent(room, StateEvent.RoomPinnedEvents);
        const content = pinEvent?.getContent<RoomPinnedEventsEventContent>() ?? { pinned: [] };
        const newContent: RoomPinnedEventsEventContent = {
          pinned: content.pinned.filter((id) => id !== eventId),
        };
        return mx.sendStateEvent(room.roomId, StateEvent.RoomPinnedEvents, newContent);
      },
      [mx, room]
    );

    return (
      <MessageListMenu
        ref={ref}
        room={room}
        title="Pinned Messages"
        eventIds={newestFirst}
        onRemove={canPinEvent ? unpin : undefined}
        removeLabel="Unpin Message"
        emptyIcon={Icons.Pin}
        emptyTitle="No Pinned Messages"
        emptyDescription="Users with sufficient power level can pin a message from its context menu."
        requestClose={requestClose}
      />
    );
  }
);

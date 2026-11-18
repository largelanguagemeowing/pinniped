import React, { forwardRef, useCallback } from 'react';
import { Room } from 'matrix-js-sdk';
import { Icons } from 'folds';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useRoomBookmarks } from '../../../hooks/useBookmarks';
import { removeBookmark } from '../../../plugins/bookmarks';
import { MessageListMenu } from '../message-list-menu';

type RoomBookmarkMenuProps = {
  room: Room;
  requestClose: () => void;
};
/** The user's own bookmarks in this room. */
export const RoomBookmarkMenu = forwardRef<HTMLDivElement, RoomBookmarkMenuProps>(
  ({ room, requestClose }, ref) => {
    const mx = useMatrixClient();
    const eventIds = useRoomBookmarks(room.roomId);
    const remove = useCallback(
      (eventId: string) => removeBookmark(mx, room.roomId, eventId),
      [mx, room]
    );

    return (
      <MessageListMenu
        ref={ref}
        room={room}
        title="Bookmarks"
        eventIds={eventIds}
        onRemove={remove}
        removeLabel="Remove Bookmark"
        emptyIcon={Icons.Bookmark}
        emptyTitle="No Bookmarks"
        emptyDescription="Bookmark a message from its context menu to find it here. Only you can see your bookmarks."
        requestClose={requestClose}
      />
    );
  }
);

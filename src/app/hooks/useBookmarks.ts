import { useCallback, useMemo, useState } from 'react';
import { MatrixEvent } from 'matrix-js-sdk';
import { useMatrixClient } from './useMatrixClient';
import { useAccountDataCallback } from './useAccountDataCallback';
import { Bookmark, getBookmarks, isBookmarkAccountDataType } from '../plugins/bookmarks';

/** The user's active bookmarks, newest first, following account data as it syncs. */
export const useBookmarks = (): Bookmark[] => {
  const mx = useMatrixClient();
  const [bookmarks, setBookmarks] = useState(() => getBookmarks(mx));

  useAccountDataCallback(
    mx,
    useCallback(
      (evt: MatrixEvent) => {
        if (isBookmarkAccountDataType(evt.getType())) setBookmarks(getBookmarks(mx));
      },
      [mx]
    )
  );

  return bookmarks;
};

/** IDs of the room's bookmarked events, newest first. */
export const useRoomBookmarks = (roomId: string): string[] => {
  const bookmarks = useBookmarks();
  return useMemo(
    () => Array.from(new Set(bookmarks.filter((b) => b.roomId === roomId).map((b) => b.eventId))),
    [bookmarks, roomId]
  );
};

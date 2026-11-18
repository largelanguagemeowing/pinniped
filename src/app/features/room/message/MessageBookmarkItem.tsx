import React, { useCallback } from 'react';
import { MatrixEvent, Room } from 'matrix-js-sdk';
import { Icon, Icons, MenuItem, Text, color } from 'folds';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useRoomBookmarks } from '../../../hooks/useBookmarks';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { addBookmark, bookmarkTarget, removeBookmark } from '../../../plugins/bookmarks';
import * as css from './styles.css';

type MessageBookmarkItemProps = {
  room: Room;
  mEvent: MatrixEvent;
  onClose: () => void;
};
/** Adds or removes a private bookmark of a sent message; stays open to show a failure. */
export function MessageBookmarkItem({ room, mEvent, onClose }: MessageBookmarkItemProps) {
  const mx = useMatrixClient();
  const eventId = mEvent.getId();
  const bookmarked = useRoomBookmarks(room.roomId).some((id) => id === eventId);

  const [toggleState, toggle] = useAsyncCallback(
    useCallback(async () => {
      if (bookmarked) {
        if (eventId !== undefined) await removeBookmark(mx, room.roomId, eventId);
        return;
      }
      const target = bookmarkTarget(room, mEvent);
      if (target) await addBookmark(mx, target);
    }, [mx, room, mEvent, eventId, bookmarked])
  );

  if (eventId === undefined || mEvent.isSending()) return null;

  const busy = toggleState.status === AsyncStatus.Loading;
  const handleClick = () => {
    if (busy) return;
    // a failure stays in toggleState and is shown below
    toggle().then(onClose, () => undefined);
  };

  let label = bookmarked ? 'Remove Bookmark' : 'Bookmark Message';
  if (busy) label = bookmarked ? 'Removing Bookmark…' : 'Bookmarking…';

  return (
    <>
      <MenuItem
        size="300"
        after={<Icon size="100" src={Icons.Bookmark} filled={bookmarked} />}
        radii="300"
        onClick={handleClick}
        aria-disabled={busy}
        aria-pressed={bookmarked}
      >
        <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
          {label}
        </Text>
      </MenuItem>
      {toggleState.status === AsyncStatus.Error && (
        <Text size="T200" role="alert" style={{ color: color.Critical.Main }}>
          Could not update the bookmark. Please try again.
        </Text>
      )}
    </>
  );
}

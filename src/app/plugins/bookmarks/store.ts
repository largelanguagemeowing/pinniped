import { MatrixClient } from 'matrix-js-sdk';
import {
  Bookmark,
  BOOKMARKS_INDEX_TYPE,
  bookmarkItemType,
  BookmarkTarget,
  createBookmarkItem,
  deriveBookmarkId,
  isBookmarkItem,
  listBookmarks,
  parseBookmarksIndex,
  tombstoned,
  withBookmarkAdded,
  withBookmarksRemoved,
} from './msc4438';

const readIndex = (mx: MatrixClient) =>
  parseBookmarksIndex(mx.getAccountData(BOOKMARKS_INDEX_TYPE)?.getContent());

const readItem = (mx: MatrixClient, bookmarkId: string): unknown =>
  mx.getAccountData(bookmarkItemType(bookmarkId))?.getContent();

/** Active bookmarks, newest first, from the locally synced account data. */
export const getBookmarks = (mx: MatrixClient): Bookmark[] =>
  listBookmarks(readIndex(mx), (id) => readItem(mx, id));

const bookmarksOf = (mx: MatrixClient, roomId: string, eventId: string): Bookmark[] =>
  getBookmarks(mx).filter((b) => b.roomId === roomId && b.eventId === eventId);

// Writes run one after another; `setAccountData` resolves once sync has echoed the change, so
// each write reads what the previous one left instead of overwriting it with a stale index.
let writeQueue: Promise<unknown> = Promise.resolve();
const enqueue = (write: () => Promise<void>): Promise<void> => {
  const run = writeQueue.catch(() => undefined).then(write);
  writeQueue = run;
  return run;
};

/** Bookmarks an event; a no-op when it already is. Item first, then the index. */
export const addBookmark = (mx: MatrixClient, target: BookmarkTarget): Promise<void> =>
  enqueue(async () => {
    if (bookmarksOf(mx, target.roomId, target.eventId).length > 0) return;

    const bookmarkId = await deriveBookmarkId(target.roomId, target.eventId);
    const item = createBookmarkItem(bookmarkId, target, Date.now());
    await mx.setAccountData(bookmarkItemType(bookmarkId), item);
    await mx.setAccountData(
      BOOKMARKS_INDEX_TYPE,
      withBookmarkAdded(readIndex(mx), bookmarkId, Date.now())
    );
  });

/**
 * Removes every bookmark of an event (other clients may have added it under their own IDs).
 * Index first, then the items become tombstones.
 */
export const removeBookmark = (mx: MatrixClient, roomId: string, eventId: string): Promise<void> =>
  enqueue(async () => {
    const ids = new Set(bookmarksOf(mx, roomId, eventId).map((b) => b.id));
    if (ids.size === 0) return;

    await mx.setAccountData(
      BOOKMARKS_INDEX_TYPE,
      withBookmarksRemoved(readIndex(mx), ids, Date.now())
    );
    await Promise.all(
      Array.from(ids, async (id) => {
        const item = readItem(mx, id);
        if (isBookmarkItem(id, item))
          await mx.setAccountData(bookmarkItemType(id), tombstoned(item));
      })
    );
  });

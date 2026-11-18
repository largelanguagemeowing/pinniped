// MSC4438 message bookmarks under its unstable prefix: global account data holding one
// index event (ordered bookmark IDs) and one item event per bookmark. Account data cannot
// be deleted, so a removed bookmark leaves its item behind as a `deleted` tombstone.

export const BOOKMARKS_INDEX_TYPE = 'org.matrix.msc4438.bookmarks.index';
export const BOOKMARK_ITEM_TYPE_PREFIX = 'org.matrix.msc4438.bookmark.';
export type BookmarkItemType = `${typeof BOOKMARK_ITEM_TYPE_PREFIX}${string}`;

export const bookmarkItemType = (bookmarkId: string): BookmarkItemType =>
  `${BOOKMARK_ITEM_TYPE_PREFIX}${bookmarkId}`;

/** Whether account data of this type belongs to the bookmark set. */
export const isBookmarkAccountDataType = (type: string): boolean =>
  type === BOOKMARKS_INDEX_TYPE || type.startsWith(BOOKMARK_ITEM_TYPE_PREFIX);

export type BookmarksIndexContent = {
  version: 1;
  /** Bumped on every write; a change signal only, not a conflict check. */
  revision: number;
  updated_ts: number;
  /** Newest first. */
  bookmark_ids: string[];
};

export type BookmarkItemContent = {
  version: 1;
  bookmark_id: string;
  uri: string;
  room_id: string;
  event_id: string;
  event_ts: number;
  bookmarked_ts: number;
  sender?: string;
  room_name?: string;
  body_preview?: string;
  msgtype?: string;
  deleted?: boolean;
};

/** An active bookmark, as the app uses it. */
export type Bookmark = {
  id: string;
  roomId: string;
  eventId: string;
  bookmarkedTs: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isInteger = (value: unknown): value is number => Number.isSafeInteger(value);

const isOptional = (value: unknown, type: 'string' | 'boolean'): boolean =>
  value === undefined || typeof value === type;

/** The index, or `undefined` when it is missing or malformed (both mean no bookmarks). */
export const parseBookmarksIndex = (content: unknown): BookmarksIndexContent | undefined => {
  if (!isRecord(content) || content.version !== 1) return undefined;
  const { revision, updated_ts: updatedTs, bookmark_ids: ids } = content;
  if (!isInteger(revision) || !isInteger(updatedTs)) return undefined;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return undefined;
  return { version: 1, revision, updated_ts: updatedTs, bookmark_ids: ids };
};

/** Whether `content` is a well-formed item stored under `bookmarkId`, tombstoned or not. */
export const isBookmarkItem = (
  bookmarkId: string,
  content: unknown
): content is BookmarkItemContent =>
  isRecord(content) &&
  content.version === 1 &&
  content.bookmark_id === bookmarkId &&
  typeof content.uri === 'string' &&
  typeof content.room_id === 'string' &&
  typeof content.event_id === 'string' &&
  isInteger(content.event_ts) &&
  isInteger(content.bookmarked_ts) &&
  isOptional(content.sender, 'string') &&
  isOptional(content.room_name, 'string') &&
  isOptional(content.body_preview, 'string') &&
  isOptional(content.msgtype, 'string') &&
  isOptional(content.deleted, 'boolean');

/**
 * Active bookmarks in index order. Repeated IDs count once; missing, malformed and
 * tombstoned items are skipped.
 */
export const listBookmarks = (
  index: BookmarksIndexContent | undefined,
  getItem: (bookmarkId: string) => unknown
): Bookmark[] => {
  const seen = new Set<string>();
  const bookmarks: Bookmark[] = [];
  index?.bookmark_ids.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    const item = getItem(id);
    if (!isBookmarkItem(id, item) || item.deleted === true) return;
    bookmarks.push({
      id,
      roomId: item.room_id,
      eventId: item.event_id,
      bookmarkedTs: item.bookmarked_ts,
    });
  });
  return bookmarks;
};

const nextIndex = (
  index: BookmarksIndexContent | undefined,
  bookmarkIds: string[],
  now: number
): BookmarksIndexContent => ({
  version: 1,
  revision: (index?.revision ?? 0) + 1,
  updated_ts: now,
  bookmark_ids: bookmarkIds,
});

/** The index with `bookmarkId` first, unless it is already listed. */
export const withBookmarkAdded = (
  index: BookmarksIndexContent | undefined,
  bookmarkId: string,
  now: number
): BookmarksIndexContent => {
  const ids = index?.bookmark_ids ?? [];
  return nextIndex(index, ids.includes(bookmarkId) ? ids : [bookmarkId, ...ids], now);
};

export const withBookmarksRemoved = (
  index: BookmarksIndexContent | undefined,
  bookmarkIds: ReadonlySet<string>,
  now: number
): BookmarksIndexContent =>
  nextIndex(
    index,
    (index?.bookmark_ids ?? []).filter((id) => !bookmarkIds.has(id)),
    now
  );

/** Keeps the item's content, including fields other clients added, so it can be restored. */
export const tombstoned = (item: BookmarkItemContent): BookmarkItemContent => ({
  ...item,
  deleted: true,
});

/**
 * A stable ID for an event's bookmark, so every device that bookmarks the same event writes
 * the same item. SHA-256 truncated to 128 bits: two events sharing an ID would overwrite
 * each other's item.
 */
export const deriveBookmarkId = async (roomId: string, eventId: string): Promise<string> => {
  const input = new TextEncoder().encode(JSON.stringify([roomId, eventId]));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return Array.from(digest.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
};

const stripSigil = (id: string): string => id.slice(1);

/** The spec's `matrix:` URI of an event: `matrix:roomid/<id>/e/<id>`, sigils dropped. */
export const matrixEventUri = (roomId: string, eventId: string, via: string[]): string => {
  const path = `matrix:roomid/${encodeURIComponent(stripSigil(roomId))}/e/${encodeURIComponent(
    stripSigil(eventId)
  )}`;
  const query = via.map((server) => `via=${encodeURIComponent(server)}`).join('&');
  return query ? `${path}?${query}` : path;
};

const PREVIEW_LENGTH = 120;

const bodyPreview = (body: unknown): string | undefined => {
  if (typeof body !== 'string' || body.length === 0) return undefined;
  const codePoints = Array.from(body);
  if (codePoints.length <= PREVIEW_LENGTH) return body;
  return `${codePoints.slice(0, PREVIEW_LENGTH).join('')}…`;
};

export type BookmarkTarget = {
  roomId: string;
  roomName: string;
  eventId: string;
  eventTs: number;
  sender: string | undefined;
  /** Whether the event was end-to-end encrypted. */
  encrypted: boolean;
  /** The decrypted content for an encrypted event. */
  content: Record<string, unknown>;
  via: string[];
};

/**
 * The item for a new bookmark. Account data is not end-to-end encrypted, so nothing taken
 * from an encrypted event's content (body preview, msgtype) is stored; the envelope fields
 * are already visible to the homeserver.
 */
export const createBookmarkItem = (
  bookmarkId: string,
  target: BookmarkTarget,
  now: number
): BookmarkItemContent => {
  const item: BookmarkItemContent = {
    version: 1,
    bookmark_id: bookmarkId,
    uri: matrixEventUri(target.roomId, target.eventId, target.via),
    room_id: target.roomId,
    event_id: target.eventId,
    event_ts: target.eventTs,
    bookmarked_ts: now,
    room_name: target.roomName,
  };
  if (target.sender !== undefined) item.sender = target.sender;
  if (!target.encrypted) {
    const preview = bodyPreview(target.content.body);
    if (preview !== undefined) item.body_preview = preview;
    if (typeof target.content.msgtype === 'string') item.msgtype = target.content.msgtype;
  }
  return item;
};

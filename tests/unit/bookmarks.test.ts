import { describe, expect, it } from 'vitest';
import { MatrixClient } from 'matrix-js-sdk';
import {
  BookmarkItemContent,
  BOOKMARKS_INDEX_TYPE,
  bookmarkItemType,
  BookmarkTarget,
  createBookmarkItem,
  deriveBookmarkId,
  isBookmarkAccountDataType,
  isBookmarkItem,
  listBookmarks,
  matrixEventUri,
  parseBookmarksIndex,
  tombstoned,
  withBookmarkAdded,
  withBookmarksRemoved,
} from '../../src/app/plugins/bookmarks/msc4438';
import { addBookmark, getBookmarks, removeBookmark } from '../../src/app/plugins/bookmarks/store';

const ROOM = '!room:example.org';

const index = (ids: unknown[], revision = 1) => ({
  version: 1,
  revision,
  updated_ts: 1000,
  bookmark_ids: ids,
});

const item = (id: string, eventId: string, extra: Record<string, unknown> = {}) => ({
  version: 1,
  bookmark_id: id,
  uri: `matrix:roomid/room%3Aexample.org/e/${eventId.slice(1)}`,
  room_id: ROOM,
  event_id: eventId,
  event_ts: 500,
  bookmarked_ts: 900,
  ...extra,
});

const target = (overrides: Partial<BookmarkTarget> = {}): BookmarkTarget => ({
  roomId: ROOM,
  roomName: 'Room',
  eventId: '$event',
  eventTs: 500,
  sender: '@alice:example.org',
  encrypted: false,
  content: { msgtype: 'm.text', body: 'hello' },
  via: ['example.org'],
  ...overrides,
});

describe('parseBookmarksIndex', () => {
  it('reads a well-formed index', () => {
    expect(parseBookmarksIndex(index(['a', 'b'], 7))).toEqual(index(['a', 'b'], 7));
  });

  it('treats missing or malformed content as no index', () => {
    expect(parseBookmarksIndex(undefined)).toBeUndefined();
    expect(parseBookmarksIndex({})).toBeUndefined();
    expect(parseBookmarksIndex({ ...index(['a']), version: 2 })).toBeUndefined();
    expect(parseBookmarksIndex({ ...index(['a']), revision: '1' })).toBeUndefined();
    expect(parseBookmarksIndex({ ...index(['a']), updated_ts: undefined })).toBeUndefined();
    expect(parseBookmarksIndex(index(['a', 1]))).toBeUndefined();
    expect(parseBookmarksIndex({ ...index([]), bookmark_ids: 'a' })).toBeUndefined();
  });
});

describe('isBookmarkItem', () => {
  it('accepts an item stored under its own ID, tombstoned or not', () => {
    expect(isBookmarkItem('a', item('a', '$e'))).toBe(true);
    expect(isBookmarkItem('a', item('a', '$e', { deleted: true, sender: '@b:x' }))).toBe(true);
  });

  it('rejects an item stored under another ID', () => {
    expect(isBookmarkItem('b', item('a', '$e'))).toBe(false);
  });

  it('rejects missing required and mistyped optional fields', () => {
    const { uri, ...noUri } = item('a', '$e');
    expect(uri).toBeTypeOf('string');
    expect(isBookmarkItem('a', noUri)).toBe(false);
    expect(isBookmarkItem('a', item('a', '$e', { event_ts: 1.5 }))).toBe(false);
    expect(isBookmarkItem('a', item('a', '$e', { deleted: 'yes' }))).toBe(false);
    expect(isBookmarkItem('a', item('a', '$e', { body_preview: 3 }))).toBe(false);
  });
});

describe('listBookmarks', () => {
  it('lists active items in index order, once per ID', () => {
    const items: Record<string, unknown> = {
      a: item('a', '$a'),
      b: item('b', '$b', { deleted: true }),
      c: { not: 'an item' },
      e: item('e', '$e', { deleted: false }),
    };
    const list = listBookmarks(index(['e', 'a', 'b', 'c', 'd', 'a']), (id) => items[id]);
    expect(list.map((b) => b.id)).toEqual(['e', 'a']);
    expect(list[1]).toEqual({ id: 'a', roomId: ROOM, eventId: '$a', bookmarkedTs: 900 });
  });

  it('is empty without an index', () => {
    expect(listBookmarks(undefined, () => item('a', '$a'))).toEqual([]);
  });
});

describe('index updates', () => {
  it('prepends a new ID and bumps the revision', () => {
    expect(withBookmarkAdded(parseBookmarksIndex(index(['a'], 4)), 'b', 2000)).toEqual({
      version: 1,
      revision: 5,
      updated_ts: 2000,
      bookmark_ids: ['b', 'a'],
    });
  });

  it('never lists an ID twice', () => {
    expect(withBookmarkAdded(parseBookmarksIndex(index(['a', 'b'])), 'b', 0).bookmark_ids).toEqual([
      'a',
      'b',
    ]);
  });

  it('starts a missing index at revision 1', () => {
    expect(withBookmarkAdded(undefined, 'a', 3)).toEqual({
      version: 1,
      revision: 1,
      updated_ts: 3,
      bookmark_ids: ['a'],
    });
  });

  it('removes IDs', () => {
    const next = withBookmarksRemoved(
      parseBookmarksIndex(index(['a', 'b', 'c'], 2)),
      new Set(['a', 'c']),
      9
    );
    expect(next).toEqual({ version: 1, revision: 3, updated_ts: 9, bookmark_ids: ['b'] });
  });
});

describe('tombstoned', () => {
  it('keeps the content, including fields this client does not know', () => {
    const stored = item('a', '$a', { 'org.example.note': 'kept' });
    if (!isBookmarkItem('a', stored)) throw new Error('fixture is not an item');
    expect(tombstoned(stored)).toEqual({ ...stored, deleted: true });
  });
});

describe('deriveBookmarkId', () => {
  it('is stable for an event and suffix-safe', async () => {
    const id = await deriveBookmarkId(ROOM, '$event');
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(await deriveBookmarkId(ROOM, '$event')).toBe(id);
  });

  it('differs between events, including ones a plain separator would confuse', async () => {
    expect(await deriveBookmarkId(ROOM, '$a')).not.toBe(await deriveBookmarkId(ROOM, '$b'));
    expect(await deriveBookmarkId('!a|b', '$c')).not.toBe(await deriveBookmarkId('!a', 'b|$c'));
  });
});

describe('matrixEventUri', () => {
  it('drops the sigils and encodes each part', () => {
    expect(matrixEventUri('!r/x:example.org', '$e+v', [])).toBe(
      'matrix:roomid/r%2Fx%3Aexample.org/e/e%2Bv'
    );
  });

  it('adds every via server', () => {
    expect(matrixEventUri('!r:a.org', '$e', ['a.org', 'b.org'])).toBe(
      'matrix:roomid/r%3Aa.org/e/e?via=a.org&via=b.org'
    );
  });
});

describe('createBookmarkItem', () => {
  it('records the event with a preview of an unencrypted message', () => {
    expect(createBookmarkItem('id', target(), 1234)).toEqual({
      version: 1,
      bookmark_id: 'id',
      uri: 'matrix:roomid/room%3Aexample.org/e/event?via=example.org',
      room_id: ROOM,
      event_id: '$event',
      event_ts: 500,
      bookmarked_ts: 1234,
      room_name: 'Room',
      sender: '@alice:example.org',
      body_preview: 'hello',
      msgtype: 'm.text',
    });
  });

  it('stores nothing from the content of an encrypted message', () => {
    const created = createBookmarkItem('id', target({ encrypted: true }), 0);
    expect(created).not.toHaveProperty('body_preview');
    expect(created).not.toHaveProperty('msgtype');
    expect(isBookmarkItem('id', created)).toBe(true);
  });

  it('cuts long previews on a code point boundary', () => {
    const body = `${'a'.repeat(119)}😀😀`;
    const created = createBookmarkItem('id', target({ content: { body } }), 0);
    expect(created.body_preview).toBe(`${'a'.repeat(119)}😀…`);
  });

  it('omits an empty preview and an unknown sender', () => {
    const created = createBookmarkItem(
      'id',
      target({ content: { body: '' }, sender: undefined }),
      0
    );
    expect(created).not.toHaveProperty('body_preview');
    expect(created).not.toHaveProperty('sender');
  });
});

describe('isBookmarkAccountDataType', () => {
  it('matches the index and items only', () => {
    expect(isBookmarkAccountDataType(BOOKMARKS_INDEX_TYPE)).toBe(true);
    expect(isBookmarkAccountDataType(bookmarkItemType('abc'))).toBe(true);
    expect(isBookmarkAccountDataType('org.matrix.msc4438.bookmarks.other')).toBe(false);
    expect(isBookmarkAccountDataType('m.direct')).toBe(false);
  });
});

/** Account data that, like the SDK, only shows a write once sync has echoed it. */
const fakeClient = (initial: Record<string, unknown> = {}) => {
  const data = new Map<string, unknown>(Object.entries(initial));
  const writes: string[] = [];
  const mx = {
    getAccountData: (type: string) =>
      data.has(type) ? { getContent: () => data.get(type) } : undefined,
    setAccountData: async (type: string, content: unknown) => {
      writes.push(type);
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      data.set(type, structuredClone(content));
      return {};
    },
  } as unknown as MatrixClient;
  return { mx, data, writes };
};

describe('bookmark store', () => {
  it('adds the item, then lists it in the index', async () => {
    const { mx, data, writes } = fakeClient();
    await addBookmark(mx, target());
    const id = await deriveBookmarkId(ROOM, '$event');

    expect(writes).toEqual([bookmarkItemType(id), BOOKMARKS_INDEX_TYPE]);
    expect(parseBookmarksIndex(data.get(BOOKMARKS_INDEX_TYPE))?.bookmark_ids).toEqual([id]);
    expect(getBookmarks(mx)).toEqual([
      { id, roomId: ROOM, eventId: '$event', bookmarkedTs: expect.any(Number) },
    ]);
  });

  it('does not rewrite a bookmark that exists', async () => {
    const { mx, writes } = fakeClient();
    await addBookmark(mx, target());
    await addBookmark(mx, target());
    expect(writes).toHaveLength(2);
  });

  it('keeps every bookmark when they are added at once', async () => {
    const { mx } = fakeClient();
    await Promise.all([
      addBookmark(mx, target({ eventId: '$a' })),
      addBookmark(mx, target({ eventId: '$b' })),
      addBookmark(mx, target({ eventId: '$c' })),
    ]);
    expect(getBookmarks(mx).map((b) => b.eventId)).toEqual(['$c', '$b', '$a']);
  });

  it('unlists, then tombstones, every bookmark of the event', async () => {
    const foreign = item('chr_foreign', '$event', { 'org.example.note': 'kept' });
    const { mx, data, writes } = fakeClient({
      [BOOKMARKS_INDEX_TYPE]: index(['chr_foreign', 'other']),
      [bookmarkItemType('chr_foreign')]: foreign,
      [bookmarkItemType('other')]: item('other', '$other'),
    });
    await addBookmark(mx, target());
    const id = await deriveBookmarkId(ROOM, '$event');
    // already bookmarked under another client's ID
    expect(writes).toEqual([]);

    await removeBookmark(mx, ROOM, '$event');
    expect(writes[0]).toBe(BOOKMARKS_INDEX_TYPE);
    expect(writes.slice(1)).toEqual([bookmarkItemType('chr_foreign')]);
    expect(getBookmarks(mx).map((b) => b.eventId)).toEqual(['$other']);
    expect(data.get(bookmarkItemType('chr_foreign'))).toEqual({ ...foreign, deleted: true });
    expect(data.has(bookmarkItemType(id))).toBe(false);
  });

  it('restores a removed bookmark under the same ID', async () => {
    const { mx, data } = fakeClient();
    await addBookmark(mx, target());
    await removeBookmark(mx, ROOM, '$event');
    await addBookmark(mx, target());
    const id = await deriveBookmarkId(ROOM, '$event');

    expect(getBookmarks(mx).map((b) => b.id)).toEqual([id]);
    expect(data.get(bookmarkItemType(id))).not.toHaveProperty('deleted');
    const stored = data.get(bookmarkItemType(id)) as BookmarkItemContent;
    expect(stored.event_id).toBe('$event');
  });
});

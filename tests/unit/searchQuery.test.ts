import { describe, expect, it } from 'vitest';
import { IEventWithRoomId } from 'matrix-js-sdk';
import {
  makeResultFilter,
  parseSearchDate,
  parseSearchQuery,
  removeQueryToken,
  resolveSearchQuery,
  tokenizeQuery,
} from '../../src/app/features/message-search/searchQuery';
import {
  applySuggestion,
  getSearchSuggestions,
} from '../../src/app/features/message-search/searchSuggest';

const NOW = new Date(2026, 9, 22, 15, 30).getTime();
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

const lookup = {
  users: [
    { userId: '@alice:stablecat.club', name: 'Alice' },
    { userId: '@alex:stablecat.club', name: 'Alex Rivers' },
    { userId: '@alexa:other.org', name: 'Alexa' },
    { userId: '@blong:stablecat.club', name: 'blong' },
  ],
  rooms: [
    { roomId: '!ai:stablecat.club', name: 'ai' },
    { roomId: '!home:stablecat.club', name: 'home' },
  ],
};

const event = (content: Record<string, unknown>, ts = NOW, id = '$e'): IEventWithRoomId =>
  ({
    event_id: id,
    room_id: '!ai:stablecat.club',
    origin_server_ts: ts,
    content,
  }) as unknown as IEventWithRoomId;

describe('tokenizeQuery', () => {
  it('keeps quoted phrases and quoted operator values whole', () => {
    const tokens = tokenizeQuery('hello "big cat" from:"Alex Rivers" mew');
    expect(tokens.map((t) => t.raw)).toEqual(['hello', '"big cat"', 'from:"Alex Rivers"', 'mew']);
  });

  it('treats unknown operators as text', () => {
    expect(tokenizeQuery('foo:bar')[0].kind).toBe('text');
  });

  it('records positions so a token can be removed', () => {
    const q = 'cat from:alice dog';
    const [, filter] = tokenizeQuery(q);
    expect(removeQueryToken(q, filter)).toBe('cat dog');
  });
});

describe('parseSearchQuery', () => {
  it('separates free text from filters', () => {
    const q = parseSearchQuery('meow from:alice in:ai has:image has:link', NOW);
    expect(q.text).toBe('meow');
    expect(q.from).toEqual(['alice']);
    expect(q.in).toEqual(['ai']);
    expect(q.has).toEqual(['image', 'link']);
  });

  it('ignores an operator that has no value yet', () => {
    const q = parseSearchQuery('meow from:', NOW);
    expect(q.text).toBe('meow');
    expect(q.from).toEqual([]);
    expect(q.invalid).toEqual([]);
  });

  it('flags unknown has: kinds and bad dates', () => {
    const q = parseSearchQuery('x has:banana before:soon pinned:maybe', NOW);
    expect(q.invalid.map((t) => t.raw)).toEqual(['has:banana', 'before:soon', 'pinned:maybe']);
  });

  it('builds date bounds with Discord semantics', () => {
    expect(parseSearchQuery('x before:2026-10-01', NOW).before).toBe(day(2026, 10, 1));
    // after: excludes the named day
    expect(parseSearchQuery('x after:2026-10-01', NOW).after).toBe(day(2026, 10, 2));
    const during = parseSearchQuery('x during:2026-10-01', NOW);
    expect(during.after).toBe(day(2026, 10, 1));
    expect(during.before).toBe(day(2026, 10, 2));
  });

  it('narrows when several bounds are given', () => {
    const q = parseSearchQuery('x after:2026-10-01 after:2026-10-05 before:2026-10-20', NOW);
    expect(q.after).toBe(day(2026, 10, 6));
    expect(q.before).toBe(day(2026, 10, 20));
  });
});

describe('parseSearchDate', () => {
  it('understands today and yesterday', () => {
    expect(parseSearchDate('today', NOW)).toBe(day(2026, 10, 22));
    expect(parseSearchDate('yesterday', NOW)).toBe(day(2026, 10, 21));
  });

  it('rejects impossible dates', () => {
    expect(parseSearchDate('2026-02-31', NOW)).toBeUndefined();
    expect(parseSearchDate('10/22/2026', NOW)).toBeUndefined();
  });
});

describe('resolveSearchQuery', () => {
  const defaultRooms = ['!ai:stablecat.club', '!home:stablecat.club'];

  it('resolves by localpart, display name and full id', () => {
    const r = resolveSearchQuery(
      parseSearchQuery('x from:blong from:"Alex Rivers" from:@alice:stablecat.club', NOW),
      lookup,
      defaultRooms
    );
    expect(r.senders).toEqual([
      '@blong:stablecat.club',
      '@alex:stablecat.club',
      '@alice:stablecat.club',
    ]);
    expect(r.unresolved).toEqual([]);
  });

  it('prefers an exact match over a longer prefix match', () => {
    const r = resolveSearchQuery(parseSearchQuery('x from:alex', NOW), lookup, defaultRooms);
    expect(r.senders).toEqual(['@alex:stablecat.club']);
  });

  it('falls back to prefix matches', () => {
    const r = resolveSearchQuery(parseSearchQuery('x from:ale', NOW), lookup, defaultRooms);
    expect(r.senders).toEqual(['@alex:stablecat.club', '@alexa:other.org']);
  });

  it('reports names that match nothing', () => {
    const r = resolveSearchQuery(
      parseSearchQuery('x from:nobody in:nowhere', NOW),
      lookup,
      defaultRooms
    );
    expect(r.unresolved).toEqual([
      { operator: 'from', value: 'nobody' },
      { operator: 'in', value: 'nowhere' },
    ]);
  });

  it('uses the default scope unless in: is given', () => {
    expect(resolveSearchQuery(parseSearchQuery('x', NOW), lookup, defaultRooms).rooms).toEqual(
      defaultRooms
    );
    expect(
      resolveSearchQuery(parseSearchQuery('x in:#ai', NOW), lookup, defaultRooms).rooms
    ).toEqual(['!ai:stablecat.club']);
  });

  it('only asks for client filtering when the server cannot do the job', () => {
    const plain = resolveSearchQuery(parseSearchQuery('x from:alice', NOW), lookup, defaultRooms);
    expect(plain.needsClientFilter).toBe(false);
    const link = resolveSearchQuery(parseSearchQuery('x has:link', NOW), lookup, defaultRooms);
    expect(link.needsClientFilter).toBe(true);
    const dated = resolveSearchQuery(
      parseSearchQuery('x before:2026-10-01', NOW),
      lookup,
      defaultRooms
    );
    expect(dated.needsClientFilter).toBe(true);
  });
});

describe('makeResultFilter', () => {
  const filterFor = (q: string, pinned: string[] = []) =>
    makeResultFilter(
      resolveSearchQuery(parseSearchQuery(q, NOW), lookup, []),
      () => new Set(pinned)
    );

  it('filters by media kind via msgtype, looking through edits', () => {
    const f = filterFor('x has:image');
    expect(f(event({ msgtype: 'm.image', body: 'cat.png' }))).toBe(true);
    expect(f(event({ msgtype: 'm.text', body: 'hi' }))).toBe(false);
    expect(
      f(event({ msgtype: 'm.text', 'm.new_content': { msgtype: 'm.image', body: 'cat.png' } }))
    ).toBe(true);
  });

  it('detects links in plain and formatted bodies', () => {
    const f = filterFor('x has:link');
    expect(f(event({ msgtype: 'm.text', body: 'see https://example.org' }))).toBe(true);
    expect(
      f(event({ msgtype: 'm.text', body: 'see this', formatted_body: '<a href="x">this</a>' }))
    ).toBe(true);
    expect(f(event({ msgtype: 'm.text', body: 'no link' }))).toBe(false);
  });

  it('applies date bounds', () => {
    const f = filterFor('x after:2026-10-01 before:2026-10-10');
    expect(f(event({}, day(2026, 10, 5)))).toBe(true);
    expect(f(event({}, day(2026, 10, 2)))).toBe(true);
    expect(f(event({}, day(2026, 10, 1) + 3600_000))).toBe(false);
    expect(f(event({}, day(2026, 10, 10)))).toBe(false);
  });

  it('matches mentions via m.mentions and legacy pills', () => {
    const f = filterFor('x mentions:blong');
    expect(f(event({ 'm.mentions': { user_ids: ['@blong:stablecat.club'] } }))).toBe(true);
    expect(
      f(event({ formatted_body: '<a href="https://matrix.to/#/@blong:stablecat.club">b</a>' }))
    ).toBe(true);
    expect(f(event({ 'm.mentions': { user_ids: ['@alice:stablecat.club'] } }))).toBe(false);
  });

  it('matches pinned events, resolving edits to the original id', () => {
    const f = filterFor('x pinned:true', ['$orig']);
    expect(f(event({}, NOW, '$orig'))).toBe(true);
    expect(
      f(event({ 'm.relates_to': { rel_type: 'm.replace', event_id: '$orig' } }, NOW, '$edit'))
    ).toBe(true);
    expect(f(event({}, NOW, '$other'))).toBe(false);
  });
});

describe('getSearchSuggestions', () => {
  const sugg = (input: string, caret = input.length) => getSearchSuggestions(input, caret, lookup);

  it('offers operators for an empty box but not while typing free text', () => {
    expect(sugg('')?.items.map((i) => i.label)).toContain('from:');
    expect(sugg('meow')).toBeUndefined();
    expect(sugg('meow ')).toBeUndefined();
  });

  it('completes a partial operator', () => {
    expect(sugg('cat fr')?.items.map((i) => i.label)).toEqual(['from:']);
    expect(sugg('cat h')?.items.map((i) => i.label)).toEqual(['has:']);
  });

  it('suggests members for from:, matching display name or localpart', () => {
    const s = sugg('cat from:ale');
    expect(s?.items.map((i) => i.hint)).toEqual(['@alex:stablecat.club', '@alexa:other.org']);
    expect(s?.items[0].insert).toBe('from:alex');
  });

  it('quotes display names that contain spaces only when needed', () => {
    const s = getSearchSuggestions('in:', 3, {
      ...lookup,
      rooms: [{ roomId: '!x', name: 'big cats' }],
    });
    expect(s?.items[0].insert).toBe('in:"big cats"');
  });

  it('uses the full id when two members share a localpart', () => {
    const s = getSearchSuggestions('from:sam', 8, {
      rooms: [],
      users: [
        { userId: '@sam:a.org', name: 'Sam' },
        { userId: '@sam:b.org', name: 'Sam' },
      ],
    });
    expect(s?.items.map((i) => i.insert)).toEqual(['from:@sam:a.org', 'from:@sam:b.org']);
  });

  it('replaces only the token under the caret', () => {
    const input = 'from:al dog';
    const s = sugg(input, 7);
    if (!s) throw new Error('expected suggestions');
    const applied = applySuggestion(input, s, s.items[0]);
    expect(applied.value).toBe('from:alice dog');
    expect(applied.caret).toBe('from:alice'.length);
  });

  it('adds a space after a finished value but not after an operator name', () => {
    const s = sugg('has:im');
    if (!s) throw new Error('expected suggestions');
    expect(applySuggestion('has:im', s, s.items[0]).value).toBe('has:image ');
    const o = sugg('fr');
    if (!o) throw new Error('expected suggestions');
    expect(applySuggestion('fr', o, o.items[0]).value).toBe('from:');
  });
});

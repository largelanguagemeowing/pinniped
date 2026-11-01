import {
  HAS_KINDS,
  SEARCH_OPERATORS,
  SearchLookup,
  SearchOperator,
  tokenizeQuery,
} from './searchQuery';

export type SearchSuggestion = {
  /** stable key for rendering */
  key: string;
  /** primary text */
  label: string;
  /** secondary text, e.g. what an operator does */
  hint?: string;
  /** replaces the token under the caret */
  insert: string;
};

export type SearchSuggestions = {
  /** range of the input the chosen suggestion replaces */
  start: number;
  end: number;
  /** what the suggestions are for, shown as a section heading */
  title: string;
  items: SearchSuggestion[];
};

const OPERATOR_HINTS: Record<SearchOperator, string> = {
  from: 'a specific person',
  in: 'a specific room',
  mentions: 'messages mentioning a person',
  has: 'link, image, video, audio, file',
  before: 'before a date',
  after: 'after a date',
  during: 'on a date',
  pinned: 'pinned messages',
};

const MAX_ITEMS = 8;

const quoteIfNeeded = (value: string): string => (/\s/.test(value) ? `"${value}"` : value);

const norm = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/^[@#]/, '');

const localpart = (userId: string): string => userId.replace(/^@/, '').split(':')[0];

/** Best matches first: prefix of the name, then prefix of a later word, then substring. */
const rankMatches = <T>(items: T[], needle: string, keys: (item: T) => string[]): T[] => {
  const n = norm(needle);
  const scored: [number, T][] = [];
  items.forEach((item) => {
    let best = Infinity;
    keys(item).forEach((key) => {
      const k = norm(key);
      let score = Infinity;
      if (!n) score = 0;
      else if (k.startsWith(n)) score = 0;
      else if (k.split(/[\s._-]+/).some((w) => w.startsWith(n))) score = 1;
      else if (k.includes(n)) score = 2;
      best = Math.min(best, score);
    });
    if (best < Infinity) scored.push([best, item]);
  });
  return scored.sort((a, b) => a[0] - b[0]).map(([, item]) => item);
};

/**
 * Suggestions for the token the caret is in. Returns undefined when there is
 * nothing useful to offer, so the popup can close.
 */
export const getSearchSuggestions = (
  input: string,
  caret: number,
  lookup: SearchLookup
): SearchSuggestions | undefined => {
  const token = tokenizeQuery(input).find((t) => t.start <= caret && caret <= t.end);
  const start = token?.start ?? caret;
  const end = token?.end ?? caret;
  const typed = token?.raw ?? '';

  if (token?.kind === 'filter') {
    const { value } = token;
    const range = { start, end };
    const prefix = `${token.operator}:`;

    switch (token.operator) {
      case 'from':
      case 'mentions': {
        const matches = rankMatches(lookup.users, value, (u) => [
          u.name,
          localpart(u.userId),
          u.userId,
        ]).slice(0, MAX_ITEMS);
        // two people with the same localpart on different servers need the full id
        const localpartCount = new Map<string, number>();
        lookup.users.forEach((u) =>
          localpartCount.set(
            localpart(u.userId),
            (localpartCount.get(localpart(u.userId)) ?? 0) + 1
          )
        );
        return {
          ...range,
          title: token.operator === 'from' ? 'From user' : 'Mentioning user',
          items: matches.map((u) => ({
            key: u.userId,
            label: u.name,
            hint: u.userId,
            insert: `${prefix}${quoteIfNeeded(
              (localpartCount.get(localpart(u.userId)) ?? 0) > 1 ? u.userId : localpart(u.userId)
            )}`,
          })),
        };
      }
      case 'in': {
        const matches = rankMatches(lookup.rooms, value, (r) => [r.name]).slice(0, MAX_ITEMS);
        return {
          ...range,
          title: 'In room',
          items: matches.map((r) => ({
            key: r.roomId,
            label: r.name,
            // Queries have no escape for a quote, so such a name is inserted as its id.
            insert: `${prefix}${r.name.includes('"') ? r.roomId : quoteIfNeeded(r.name)}`,
          })),
        };
      }
      case 'has':
        return {
          ...range,
          title: 'Has',
          items: HAS_KINDS.filter((k) => k.startsWith(value.toLowerCase())).map((k) => ({
            key: k,
            label: k,
            insert: `${prefix}${k}`,
          })),
        };
      case 'before':
      case 'after':
      case 'during':
        return {
          ...range,
          title: 'Date',
          items: [
            { key: 'today', label: 'today', hint: 'or type YYYY-MM-DD', insert: `${prefix}today` },
            { key: 'yesterday', label: 'yesterday', insert: `${prefix}yesterday` },
          ].filter((i) => i.label.startsWith(value.toLowerCase())),
        };
      case 'pinned':
        return {
          ...range,
          title: 'Pinned',
          items: [{ key: 'true', label: 'true', insert: `${prefix}true` }].filter((i) =>
            i.label.startsWith(value.toLowerCase())
          ),
        };
      default:
        return undefined;
    }
  }

  // plain text (or nothing yet): offer operators that continue what was typed.
  // Text with a colon is not an operator being typed, and short free-text words
  // would otherwise pop the menu open on every keystroke.
  if (typed.includes(':') || typed.includes('"')) return undefined;
  // an empty token only lists operators when the whole box is empty, so a space
  // after a finished word does not pop the menu open
  const items = SEARCH_OPERATORS.filter(
    (op) => op.startsWith(typed.toLowerCase()) && (typed.length > 0 || input.trim().length === 0)
  ).map((op) => ({
    key: op,
    label: `${op}:`,
    hint: OPERATOR_HINTS[op],
    insert: `${op}:`,
  }));
  if (items.length === 0) return undefined;
  return { start, end, title: 'Search options', items };
};

/** Apply a suggestion to the input, returning the new text and caret position. */
export const applySuggestion = (
  input: string,
  suggestions: SearchSuggestions,
  suggestion: SearchSuggestion
): { value: string; caret: number } => {
  const before = input.slice(0, suggestions.start);
  const after = input.slice(suggestions.end);
  // finishing a value is done; leave a space so typing continues with the next term.
  // An operator name (`from:`) is not finished: the user types its value next.
  const finished = !suggestion.insert.endsWith(':');
  const tail = finished && !after.startsWith(' ') ? ' ' : '';
  return {
    value: `${before}${suggestion.insert}${tail}${after}`,
    caret: before.length + suggestion.insert.length + tail.length,
  };
};

import { MatrixClient } from 'matrix-js-sdk';
import { getAccountData } from '../utils/room';
import { IEmoji, findEmojiByUnicode } from './emoji';
import { AccountDataEvent } from '../../types/matrix/accountData';

/** One `m.recent_emoji` entry; entries may carry properties this client does not know. */
export type RecentEmojiEntry = {
  emoji: string;
  total: number;
};

export type RecentEmojiContent = {
  recent_emoji: RecentEmojiEntry[];
};

/** The spec's recommended maximum list length. */
export const RECENT_EMOJI_LIMIT = 100;

// the spec bounds totals to non-negative numbers below 2^53
const isValidTotal = (total: unknown): total is number =>
  typeof total === 'number' && total >= 0 && total < 2 ** 53;

const isRecentEmojiEntry = (value: unknown): value is RecentEmojiEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const { emoji, total } = value as Record<string, unknown>;
  return typeof emoji === 'string' && isValidTotal(total);
};

/**
 * `m.recent_emoji` content as entries, most recently used first. Malformed entries are dropped;
 * entries with emoji this client does not recognise are kept so writes preserve them.
 */
export const parseRecentEmoji = (content: unknown): RecentEmojiEntry[] => {
  const list = (content as Partial<RecentEmojiContent> | undefined)?.recent_emoji;
  if (!Array.isArray(list)) return [];
  return list.filter(isRecentEmojiEntry);
};

/** `io.element.recent_emoji` content (`[emoji, total]` pairs) as entries. */
export const parseLegacyRecentEmoji = (content: unknown): RecentEmojiEntry[] => {
  const list = (content as { recent_emoji?: unknown } | undefined)?.recent_emoji;
  if (!Array.isArray(list)) return [];
  return list.flatMap((pair: unknown) => {
    if (!Array.isArray(pair)) return [];
    const [emoji, total] = pair;
    const entry = { emoji, total };
    return isRecentEmojiEntry(entry) ? [entry] : [];
  });
};

/** `entries` after one use of `emoji`: moved to the front with its total raised, then truncated. */
export const withRecentEmojiUse = (
  entries: RecentEmojiEntry[],
  emoji: string
): RecentEmojiEntry[] => {
  const index = entries.findIndex((entry) => entry.emoji === emoji);
  if (index < 0) return [{ emoji, total: 1 }, ...entries].slice(0, RECENT_EMOJI_LIMIT);

  const entry = entries[index];
  const used = { ...entry, total: Math.min(entry.total + 1, Number.MAX_SAFE_INTEGER) };
  return [used, ...entries.filter((_, i) => i !== index)].slice(0, RECENT_EMOJI_LIMIT);
};

export const isRecentEmojiEvent = (eventType: string): boolean =>
  eventType === AccountDataEvent.RecentEmoji || eventType === AccountDataEvent.ElementRecentEmoji;

// Once the stable event exists it is authoritative; until then the unstable list seeds it.
const getRecentEmojiList = (mx: MatrixClient): RecentEmojiEntry[] => {
  const stable = getAccountData(mx, AccountDataEvent.RecentEmoji);
  if (stable) return parseRecentEmoji(stable.getContent());
  return parseLegacyRecentEmoji(
    getAccountData(mx, AccountDataEvent.ElementRecentEmoji)?.getContent()
  );
};

/** Recognised unicode emoji with their totals, most used first; ties stay most recent first. */
export const getRecentEmojiEntries = (mx: MatrixClient): [IEmoji, number][] =>
  getRecentEmojiList(mx)
    .flatMap(({ emoji, total }): [IEmoji, number][] => {
      const found = findEmojiByUnicode(emoji);
      return found ? [[found, total]] : [];
    })
    .sort((e1, e2) => e2[1] - e1[1]);

export const getRecentEmojis = (mx: MatrixClient, limit?: number): IEmoji[] =>
  getRecentEmojiEntries(mx)
    .slice(0, limit)
    .map(([emoji]) => emoji);

export function addRecentEmoji(mx: MatrixClient, unicode: string) {
  const content: RecentEmojiContent = {
    recent_emoji: withRecentEmojiUse(getRecentEmojiList(mx), unicode),
  };
  mx.setAccountData(AccountDataEvent.RecentEmoji, content);
}

import { describe, expect, it, vi } from 'vitest';
import { MatrixClient } from 'matrix-js-sdk';
import {
  addRecentEmoji,
  getRecentEmojis,
  parseLegacyRecentEmoji,
  parseRecentEmoji,
  RECENT_EMOJI_LIMIT,
  RecentEmojiEntry,
  withRecentEmojiUse,
} from '../../src/app/plugins/recent-emoji';

const fakeClient = (accountData: Record<string, unknown>) => {
  const setAccountData = vi.fn(async () => ({}));
  const mx = {
    getAccountData: (type: string) =>
      type in accountData ? { getContent: () => accountData[type] } : undefined,
    setAccountData,
  } as unknown as MatrixClient;
  return { mx, setAccountData };
};

describe('parseRecentEmoji', () => {
  it('keeps the list order and unrecognised emoji', () => {
    const content = {
      recent_emoji: [
        { emoji: '🤔', total: 19 },
        { emoji: 'not-an-emoji', total: 2 },
      ],
    };
    expect(parseRecentEmoji(content)).toEqual(content.recent_emoji);
  });

  it('drops entries that break the schema', () => {
    const content = {
      recent_emoji: [
        { emoji: '👍', total: -1 },
        { emoji: '👍', total: 2 ** 53 },
        { emoji: 5, total: 1 },
        { emoji: '👍' },
        null,
        ['👍', 1],
        { emoji: '😅', total: 0 },
      ],
    };
    expect(parseRecentEmoji(content)).toEqual([{ emoji: '😅', total: 0 }]);
  });

  it('is empty for missing or malformed content', () => {
    expect(parseRecentEmoji(undefined)).toEqual([]);
    expect(parseRecentEmoji({})).toEqual([]);
    expect(parseRecentEmoji({ recent_emoji: 'nope' })).toEqual([]);
  });
});

describe('parseLegacyRecentEmoji', () => {
  it('converts pairs and drops malformed ones', () => {
    expect(
      parseLegacyRecentEmoji({ recent_emoji: [['🤔', 3], ['👍'], 'x', [1, 2], ['😅', -2]] })
    ).toEqual([{ emoji: '🤔', total: 3 }]);
  });
});

describe('withRecentEmojiUse', () => {
  const entries: RecentEmojiEntry[] = [
    { emoji: '🤔', total: 19 },
    { emoji: '👍', total: 7 },
  ];

  it('moves a used emoji to the front and counts it', () => {
    expect(withRecentEmojiUse(entries, '👍')).toEqual([
      { emoji: '👍', total: 8 },
      { emoji: '🤔', total: 19 },
    ]);
  });

  it('adds a new emoji at the front', () => {
    expect(withRecentEmojiUse(entries, '😅')[0]).toEqual({ emoji: '😅', total: 1 });
  });

  it('keeps properties it does not know and leaves the input alone', () => {
    const extended = [{ emoji: '🤔', total: 1, future: true }] as RecentEmojiEntry[];
    expect(withRecentEmojiUse(extended, '🤔')).toEqual([{ emoji: '🤔', total: 2, future: true }]);
    expect(extended[0].total).toBe(1);
  });

  it('truncates to the limit from the end', () => {
    const full = Array.from({ length: RECENT_EMOJI_LIMIT }, (_, i) => ({
      emoji: `e${i}`,
      total: 1,
    }));
    const used = withRecentEmojiUse(full, 'new');
    expect(used).toHaveLength(RECENT_EMOJI_LIMIT);
    expect(used[0].emoji).toBe('new');
    expect(used.some((entry) => entry.emoji === `e${RECENT_EMOJI_LIMIT - 1}`)).toBe(false);
  });

  it('stops counting at the largest total the spec allows', () => {
    const [used] = withRecentEmojiUse([{ emoji: '🤔', total: Number.MAX_SAFE_INTEGER }], '🤔');
    expect(used.total).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('recent emoji account data', () => {
  it('prefers the stable event and ranks by total', () => {
    const { mx } = fakeClient({
      'm.recent_emoji': {
        recent_emoji: [
          { emoji: '🤔', total: 1 },
          { emoji: '👍', total: 5 },
        ],
      },
      'io.element.recent_emoji': { recent_emoji: [['😅', 99]] },
    });
    expect(getRecentEmojis(mx).map((emoji) => emoji.unicode)).toEqual(['👍', '🤔']);
  });

  it('reads the unstable event while no stable one exists', () => {
    const { mx } = fakeClient({ 'io.element.recent_emoji': { recent_emoji: [['😅', 2]] } });
    expect(getRecentEmojis(mx).map((emoji) => emoji.unicode)).toEqual(['😅']);
  });

  it('writes the stable event, seeded from the unstable one', () => {
    const { mx, setAccountData } = fakeClient({
      'io.element.recent_emoji': { recent_emoji: [['😅', 2]] },
    });
    addRecentEmoji(mx, '👍');
    expect(setAccountData).toHaveBeenCalledWith('m.recent_emoji', {
      recent_emoji: [
        { emoji: '👍', total: 1 },
        { emoji: '😅', total: 2 },
      ],
    });
  });
});

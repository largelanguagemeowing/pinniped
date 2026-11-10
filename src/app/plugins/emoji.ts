import { CompactEmoji, fromUnicodeToHexcode } from 'emojibase';
import emojisData from 'emojibase-data/en/compact.json';
import joypixels from 'emojibase-data/en/shortcodes/joypixels.json';
import emojibase from 'emojibase-data/en/shortcodes/emojibase.json';

export type IEmoji = CompactEmoji & {
  shortcode: string;
};

export enum EmojiGroupId {
  People = 'People',
  Nature = 'Nature',
  Food = 'Food',
  Activity = 'Activity',
  Travel = 'Travel',
  Object = 'Object',
  Symbol = 'Symbol',
  Flag = 'Flag',
}

export type IEmojiGroup = {
  id: EmojiGroupId;
  order: number;
  emojis: IEmoji[];
};

export const getShortcodesFor = (hexcode: string): string[] | string | undefined =>
  joypixels[hexcode] || emojibase[hexcode];

export const getShortcodeFor = (hexcode: string): string | undefined => {
  const shortcode = joypixels[hexcode] || emojibase[hexcode];
  return Array.isArray(shortcode) ? shortcode[0] : shortcode;
};

export const getHexcodeForEmoji = fromUnicodeToHexcode;

export const emojiGroups: IEmojiGroup[] = [
  {
    id: EmojiGroupId.People,
    order: 0,
    emojis: [],
  },
  {
    id: EmojiGroupId.Nature,
    order: 1,
    emojis: [],
  },
  {
    id: EmojiGroupId.Food,
    order: 2,
    emojis: [],
  },
  {
    id: EmojiGroupId.Activity,
    order: 3,
    emojis: [],
  },
  {
    id: EmojiGroupId.Travel,
    order: 4,
    emojis: [],
  },
  {
    id: EmojiGroupId.Object,
    order: 5,
    emojis: [],
  },
  {
    id: EmojiGroupId.Symbol,
    order: 6,
    emojis: [],
  },
  {
    id: EmojiGroupId.Flag,
    order: 7,
    emojis: [],
  },
];

export const emojis: IEmoji[] = [];

function addEmojiToGroup(groupIndex: number, emoji: IEmoji) {
  emojiGroups[groupIndex].emojis.push(emoji);
}

function getGroupIndex(emoji: IEmoji): number | undefined {
  if (emoji.group === 0 || emoji.group === 1) return 0;
  if (emoji.group === 3) return 1;
  if (emoji.group === 4) return 2;
  if (emoji.group === 6) return 3;
  if (emoji.group === 5) return 4;
  if (emoji.group === 7) return 5;
  if (emoji.group === 8 || typeof emoji.group === 'undefined') return 6;
  if (emoji.group === 9) return 7;
  return undefined;
}

emojisData.forEach((emoji) => {
  const myShortCodes = getShortcodesFor(emoji.hexcode);
  if (!myShortCodes) return;
  if (Array.isArray(myShortCodes) && myShortCodes.length === 0) return;

  const em: IEmoji = {
    ...emoji,
    shortcode: Array.isArray(myShortCodes) ? myShortCodes[0] : myShortCodes,
    shortcodes: Array.isArray(myShortCodes) ? myShortCodes : emoji.shortcodes,
  };

  const groupIndex = getGroupIndex(em);
  if (groupIndex !== undefined) {
    addEmojiToGroup(groupIndex, em);
    emojis.push(em);
  }
});

export type EmojiReplacement = {
  key: string;
  shortcode: string;
};

/**
 * Maps every known emoji shortcode (including alternative shortcodes)
 * to its unicode character and primary shortcode.
 * Used for live `:shortcode:` auto-replacement in the editor.
 */
export const emojiShortcodeMap: Map<string, EmojiReplacement> = new Map(
  emojis.flatMap((e) => {
    const allShortcodes = Array.isArray(e.shortcodes) ? e.shortcodes : [e.shortcode];
    return allShortcodes
      .filter(Boolean)
      .map((sc) => [sc.toLowerCase(), { key: e.unicode, shortcode: e.shortcode }]);
  })
);

/** The base emoji for a unicode string, which may be one of its skin tone variants. */
export const findEmojiByUnicode = (unicode: string): IEmoji | undefined =>
  emojis.find((e) => e.unicode === unicode) ??
  emojis.find((e) => e.skins?.some((skin) => skin.unicode === unicode));

/** The emoji's unicode in the given skin tone (0 or no variant: unchanged). */
export const getEmojiUnicodeForTone = (emoji: IEmoji, tone: number): string => {
  if (!tone || !emoji.skins) return emoji.unicode;
  // Skin tone modifiers are U+1F3FB (light) to U+1F3FF (dark). Take the variant that uses only
  // the wanted modifier, which is also the right one for emoji showing several people.
  const wanted = String.fromCodePoint(0x1f3fa + tone);
  const skin = emoji.skins.find((s) => {
    const mods = s.unicode.match(/[\u{1F3FB}-\u{1F3FF}]/gu);
    return mods !== null && mods.every((m) => m === wanted);
  });
  return skin?.unicode ?? emoji.unicode;
};

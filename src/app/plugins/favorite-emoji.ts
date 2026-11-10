import { MatrixClient } from 'matrix-js-sdk';
import { getAccountData } from '../utils/room';
import { IEmoji, findEmojiByUnicode } from './emoji';
import { AccountDataEvent } from '../../types/matrix/accountData';

export type IFavoriteEmojiContent = {
  /** Base (skin tone free) unicode strings, in the order they were added. */
  favorites?: string[];
};

export const getFavoriteEmojiUnicodes = (mx: MatrixClient): string[] => {
  const content = getAccountData(
    mx,
    AccountDataEvent.PinnipedEmojiFavorites
  )?.getContent<IFavoriteEmojiContent>();
  return Array.isArray(content?.favorites)
    ? content.favorites.filter((u): u is string => typeof u === 'string')
    : [];
};

export const getFavoriteEmojis = (mx: MatrixClient): IEmoji[] =>
  getFavoriteEmojiUnicodes(mx).reduce<IEmoji[]>((list, unicode) => {
    const emoji = findEmojiByUnicode(unicode);
    if (emoji) list.push(emoji);
    return list;
  }, []);

/** Adds the emoji to the favourites, or removes it when it already is one. */
export function toggleFavoriteEmoji(mx: MatrixClient, unicode: string) {
  const base = findEmojiByUnicode(unicode)?.unicode ?? unicode;
  const current = getFavoriteEmojiUnicodes(mx);
  const favorites = current.includes(base) ? current.filter((u) => u !== base) : [...current, base];
  const content: IFavoriteEmojiContent = { favorites };
  return mx.setAccountData(AccountDataEvent.PinnipedEmojiFavorites, content);
}

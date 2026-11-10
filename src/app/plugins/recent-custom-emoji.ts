import { MatrixClient } from 'matrix-js-sdk';
import { getAccountData } from '../utils/room';
import { AccountDataEvent } from '../../types/matrix/accountData';

type EmojiMxc = string;
type EmojiUsageCount = number;

export type IRecentCustomEmojiContent = {
  recent?: [EmojiMxc, EmojiUsageCount][];
};

/** Custom emoji (by mxc url) with how many times each was used, most recent first. */
export const getRecentCustomEmojiEntries = (mx: MatrixClient): [EmojiMxc, EmojiUsageCount][] => {
  const recent = getAccountData(
    mx,
    AccountDataEvent.PinnipedRecentCustomEmoji
  )?.getContent<IRecentCustomEmojiContent>().recent;
  if (!Array.isArray(recent)) return [];
  return recent.filter(
    (entry): entry is [EmojiMxc, EmojiUsageCount] =>
      Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number'
  );
};

export function addRecentCustomEmoji(mx: MatrixClient, mxc: string) {
  const recent = getRecentCustomEmojiEntries(mx).map((entry): [EmojiMxc, EmojiUsageCount] => [
    ...entry,
  ]);
  const index = recent.findIndex(([url]) => url === mxc);
  let entry: [EmojiMxc, EmojiUsageCount] = [mxc, 1];
  if (index >= 0) {
    [entry] = recent.splice(index, 1);
    entry[1] += 1;
  }
  recent.unshift(entry);
  const content: IRecentCustomEmojiContent = { recent: recent.slice(0, 100) };
  mx.setAccountData(AccountDataEvent.PinnipedRecentCustomEmoji, content);
}

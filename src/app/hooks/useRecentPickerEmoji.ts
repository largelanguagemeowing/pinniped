import { useEffect, useMemo, useState } from 'react';
import { ClientEvent, MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { getRecentEmojiEntries } from '../plugins/recent-emoji';
import { getRecentCustomEmojiEntries } from '../plugins/recent-custom-emoji';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { IEmoji } from '../plugins/emoji';
import { PackImageReader } from '../plugins/custom-emoji';

/**
 * The picker's "Frequently Used" list: unicode and custom emoji ranked together by use.
 * Custom emoji that no longer resolve to an available pack image are skipped.
 */
export const useRecentPickerEmoji = (
  mx: MatrixClient,
  customImages: PackImageReader[],
  limit: number
): Array<IEmoji | PackImageReader> => {
  const [unicode, setUnicode] = useState(() => getRecentEmojiEntries(mx));
  const [custom, setCustom] = useState(() => getRecentCustomEmojiEntries(mx));

  useEffect(() => {
    const handleAccountData = (event: MatrixEvent) => {
      const type = event.getType();
      if (type === AccountDataEvent.ElementRecentEmoji) setUnicode(getRecentEmojiEntries(mx));
      if (type === AccountDataEvent.PinnipedRecentCustomEmoji)
        setCustom(getRecentCustomEmojiEntries(mx));
    };
    mx.on(ClientEvent.AccountData, handleAccountData);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
    };
  }, [mx]);

  return useMemo(() => {
    const byUrl = new Map<string, PackImageReader>();
    customImages.forEach((image) => {
      if (!byUrl.has(image.url)) byUrl.set(image.url, image);
    });
    const ranked: Array<[IEmoji | PackImageReader, number]> = [...unicode];
    custom.forEach(([url, count]) => {
      const image = byUrl.get(url);
      if (image) ranked.push([image, count]);
    });
    return ranked
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([item]) => item);
  }, [unicode, custom, customImages, limit]);
};

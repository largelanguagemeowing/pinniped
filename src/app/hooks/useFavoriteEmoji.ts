import { useEffect, useState } from 'react';
import { ClientEvent, MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { getFavoriteEmojis } from '../plugins/favorite-emoji';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { IEmoji } from '../plugins/emoji';

export const useFavoriteEmoji = (mx: MatrixClient): IEmoji[] => {
  const [favorites, setFavorites] = useState(() => getFavoriteEmojis(mx));

  useEffect(() => {
    const handleAccountData = (event: MatrixEvent) => {
      if (event.getType() !== AccountDataEvent.PinnipedEmojiFavorites) return;
      setFavorites(getFavoriteEmojis(mx));
    };
    mx.on(ClientEvent.AccountData, handleAccountData);
    return () => {
      mx.removeListener(ClientEvent.AccountData, handleAccountData);
    };
  }, [mx]);

  return favorites;
};

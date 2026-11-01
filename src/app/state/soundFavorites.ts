import { useCallback, useMemo } from 'react';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { useAccountData } from '../hooks/useAccountData';
import { useMatrixClient } from '../hooks/useMatrixClient';

type SoundFavoritesContent = { favorites?: unknown };

const parseFavorites = (content: SoundFavoritesContent | undefined): string[] =>
  Array.isArray(content?.favorites)
    ? content.favorites.filter((k): k is string => typeof k === 'string')
    : [];

let queue: Promise<unknown> = Promise.resolve();

/** The user's favourite soundboard sounds (keys, see Sound), synced as account data. */
export const useSoundFavorites = (): [Set<string>, (key: string) => void] => {
  const mx = useMatrixClient();
  const event = useAccountData(AccountDataEvent.PinnipedSoundFavorites);
  const list = useMemo(() => parseFavorites(event?.getContent<SoundFavoritesContent>()), [event]);
  const favorites = useMemo(() => new Set(list), [list]);

  const toggle = useCallback(
    (key: string) => {
      // Queued, and computed from the newest account data when it runs, so
      // quick toggles don't overwrite each other with a stale list.
      queue = queue
        .catch(() => undefined)
        .then(() => {
          const current = parseFavorites(
            mx.getAccountData(AccountDataEvent.PinnipedSoundFavorites)?.getContent()
          );
          const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
          return mx.setAccountData(AccountDataEvent.PinnipedSoundFavorites, { favorites: next });
        });
      queue.catch(() => undefined);
    },
    [mx]
  );

  return [favorites, toggle];
};

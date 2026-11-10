import { describe, expect, it } from 'vitest';
import { MatrixClient } from 'matrix-js-sdk';
import { FavoriteGif, getGifFavorites, StoredFavorite } from '../../src/app/state/gifFavorites';

const withStoredFavorites = (favorites: unknown): MatrixClient =>
  ({
    getAccountData: () => ({ getContent: () => ({ favorites }) }),
  }) as unknown as MatrixClient;

const gif = { id: 'gif-id', title: 'gif', media_formats: {} };
const klipyFav: FavoriteGif = { kind: 'klipy', gif };
const mxcFav: FavoriteGif = { kind: 'mxc', mxc: 'mxc://example.org/gif', body: 'gif' };
const urlFav: FavoriteGif = { kind: 'url', title: 'gif', videoUrl: 'https://example.org/gif.mp4' };

describe('getGifFavorites', () => {
  it('reads every favourite kind', () => {
    const stored: StoredFavorite[] = [
      { id: 'a', fav: klipyFav, addedAt: 3 },
      { id: 'b', fav: mxcFav, addedAt: 2 },
      { id: 'c', fav: urlFav, addedAt: 1 },
    ];
    expect(getGifFavorites(withStoredFavorites(stored))).toEqual(stored);
  });

  it('drops entries that are not favourites', () => {
    expect(
      getGifFavorites(
        withStoredFavorites([
          { id: 'a', fav: klipyFav, addedAt: 1 },
          null,
          'not an entry',
          { id: 1, fav: klipyFav, addedAt: 1 },
          { id: 'b', fav: klipyFav },
          { id: 'c', fav: { kind: 'unknown' }, addedAt: 1 },
          { id: 'd', fav: { kind: 'mxc', mxc: 'mxc://example.org/gif' }, addedAt: 1 },
          { id: 'e', addedAt: 1 },
        ])
      )
    ).toEqual([{ id: 'a', fav: klipyFav, addedAt: 1 }]);
  });

  it('upgrades the legacy { gif } entry', () => {
    expect(getGifFavorites(withStoredFavorites([{ id: 'a', gif, addedAt: 5 }]))).toEqual([
      { id: 'a', fav: klipyFav, addedAt: 5 },
    ]);
  });

  it('is empty when the account data is missing or malformed', () => {
    expect(getGifFavorites(withStoredFavorites(undefined))).toEqual([]);
    expect(getGifFavorites(withStoredFavorites({ not: 'a list' }))).toEqual([]);
  });
});

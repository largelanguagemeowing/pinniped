import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import {
  FavoriteGif,
  getGifFavorites,
  migrateGifFavorites,
  toggleGifFavorite,
} from '../../src/app/state/gifFavorites';

const fav = (id: string): FavoriteGif => ({ kind: 'url', title: id, videoUrl: id });

// account data as the server holds it: a write lands when its request resolves
const server = (initial: unknown[]) => {
  let content: { favorites: unknown[] } = { favorites: initial };
  const writes: (() => void)[] = [];
  const mx = {
    getAccountData: () => ({ getContent: () => content }),
    setAccountData: (_type: string, next: { favorites: unknown[] }) =>
      new Promise<void>((resolve) => {
        writes.push(() => {
          content = next;
          resolve();
        });
      }),
  } as unknown as MatrixClient;
  // lands every write in turn until none is left
  const flush = async () => {
    while (writes.length > 0) {
      writes.shift()!();
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
  };
  return { mx, flush, ids: () => getGifFavorites(mx).map((f) => f.id) };
};

const legacyStore = (value: unknown) => {
  const store = new Map<string, string>([['gifFavorites', JSON.stringify(value)]]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => store.delete(key),
  });
  return store;
};

describe('migrateGifFavorites', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('merges the legacy list after a toggle that is still being written', async () => {
    const { mx, flush, ids } = server([]);
    const store = legacyStore([{ id: 'legacy', fav: fav('legacy'), addedAt: 1 }]);

    const toggled = toggleGifFavorite(mx, fav('fresh'));
    // the toggle's request is out before the migration starts
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    const migrated = migrateGifFavorites(mx);
    await flush();
    await Promise.all([toggled, migrated]);

    expect(ids().sort()).toEqual(['fresh', 'legacy']);
    expect(store.has('gifFavorites')).toBe(false);
  });
});

import { useCallback, useMemo } from 'react';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { MatrixClient, MatrixEvent, MsgType } from 'matrix-js-sdk';
import { KlipyGif } from '../utils/klipy';
import { IImageInfo, MATRIX_GIF_PROPERTY_NAME } from '../../types/matrix/common';
import { parseOoyeGif } from '../utils/ooye';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { getAccountData } from '../utils/room';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useAccountData } from '../hooks/useAccountData';

// pre-account-data storage; migrated on first sync then removed
const LEGACY_STORAGE_KEY = 'gifFavorites';

// A favourite GIF can come from the Klipy picker, from any GIF image/sticker
// event in a timeline (mxc), or from an OOYE-bridged GIF message (external
// mp4 url).
export type FavoriteGif =
  | { kind: 'klipy'; gif: KlipyGif }
  | {
      kind: 'mxc';
      mxc: string;
      body: string;
      info?: IImageInfo;
      encInfo?: EncryptedAttachmentInfo;
      video?: boolean;
    }
  | { kind: 'url'; title: string; videoUrl: string; pageUrl?: string };

export const getFavoriteGifId = (fav: FavoriteGif): string => {
  if (fav.kind === 'klipy') return fav.gif.id;
  if (fav.kind === 'mxc') return fav.mxc;
  return fav.videoUrl;
};

export type StoredFavorite = {
  id: string;
  fav: FavoriteGif;
  addedAt: number;
};

export type GifFavoritesContent = {
  favorites?: StoredFavorite[];
};

const parseStoredFavorite = (item: any): StoredFavorite | undefined => {
  if (!item || typeof item.id !== 'string' || typeof item.addedAt !== 'number') return undefined;
  const { fav } = item;
  if (fav && (fav.kind === 'klipy' || fav.kind === 'mxc' || fav.kind === 'url')) {
    return { id: item.id, fav, addedAt: item.addedAt };
  }
  // Legacy format: { id, gif: KlipyGif, addedAt }
  if (item.gif) {
    return { id: item.id, fav: { kind: 'klipy', gif: item.gif }, addedAt: item.addedAt };
  }
  return undefined;
};

const parseFavorites = (list: unknown): StoredFavorite[] => {
  if (!Array.isArray(list)) return [];
  return list.map(parseStoredFavorite).filter((item): item is StoredFavorite => item !== undefined);
};

export const getGifFavorites = (mx: MatrixClient): StoredFavorite[] => {
  const content = getAccountData(
    mx,
    AccountDataEvent.PinnipedGifFavorites
  )?.getContent<GifFavoritesContent>();
  return parseFavorites(content?.favorites);
};

const setGifFavorites = (mx: MatrixClient, favorites: StoredFavorite[]): Promise<unknown> =>
  mx.setAccountData(AccountDataEvent.PinnipedGifFavorites, { favorites });

// Toggles run one after another, each against the newest account data, so quick
// successive toggles don't overwrite each other with a stale list.
let toggleQueue: Promise<unknown> = Promise.resolve();

export const toggleGifFavorite = (mx: MatrixClient, fav: FavoriteGif): Promise<unknown> => {
  toggleQueue = toggleQueue
    .catch(() => undefined)
    .then(() => {
      const id = getFavoriteGifId(fav);
      const current = getGifFavorites(mx);
      const exists = current.some((f) => f.id === id);
      const next = exists
        ? current.filter((f) => f.id !== id)
        : [{ id, fav, addedAt: Date.now() }, ...current];
      return setGifFavorites(mx, next);
    });
  return toggleQueue;
};

/**
 * Reactively returns the user's favourite GIFs, updating when the
 * `club.stablecat.pinniped.gif_favorites` account data event changes.
 */
export const useGifFavorites = (): StoredFavorite[] => {
  const event = useAccountData(AccountDataEvent.PinnipedGifFavorites);
  return useMemo(() => parseFavorites(event?.getContent<GifFavoritesContent>().favorites), [event]);
};

/**
 * Returns a stable callback that toggles a GIF in/out of favourites, persisting
 * the result to account data.
 */
export const useToggleGifFavorite = (): ((fav: FavoriteGif) => void) => {
  const mx = useMatrixClient();
  return useCallback(
    (fav: FavoriteGif) => {
      toggleGifFavorite(mx, fav);
    },
    [mx]
  );
};

/**
 * One-time migration of GIF favourites from the old localStorage store into
 * account data. Merges any legacy entries not already present, preserving
 * newest-first order, then clears the legacy key.
 */
export const migrateGifFavorites = async (mx: MatrixClient): Promise<void> => {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  let legacy: StoredFavorite[] = [];
  try {
    legacy = parseFavorites(JSON.parse(raw));
  } catch {
    legacy = [];
  }

  if (legacy.length) {
    const existing = getGifFavorites(mx);
    const existingIds = new Set(existing.map((f) => f.id));
    const merged = [...existing, ...legacy.filter((f) => !existingIds.has(f.id))].sort(
      (a, b) => b.addedAt - a.addedAt
    );
    await setGifFavorites(mx, merged);
  }

  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
};

// Extract a favouritable GIF from a timeline event: GIF image messages, GIF
// stickers and OOYE-bridged GIF text/notice messages.
export const getEventFavoriteGif = (
  mEvent: MatrixEvent,
  mediaEmbedHosts: readonly string[]
): FavoriteGif | undefined => {
  const content = mEvent.getContent();
  const msgType = content.msgtype;

  if (mEvent.getType() === 'm.sticker' || msgType === MsgType.Image) {
    const info = content.info as IImageInfo | undefined;
    const mxc = content.file?.url ?? content.url;
    if (typeof mxc !== 'string') return undefined;
    let filename = 'gif';
    if (typeof content.filename === 'string' && content.filename) filename = content.filename;
    else if (typeof content.body === 'string' && content.body) filename = content.body;
    const isGif = info?.mimetype === 'image/gif' || /\.gif$/i.test(filename);
    if (!isGif) return undefined;
    return {
      kind: 'mxc',
      mxc,
      body: filename,
      info,
      encInfo: content.file,
    };
  }

  if (msgType === MsgType.Video && content[MATRIX_GIF_PROPERTY_NAME] === true) {
    const mxc = content.file?.url ?? content.url;
    if (typeof mxc !== 'string') return undefined;
    const filename = content.filename ?? content.body ?? 'gif.mp4';
    return {
      kind: 'mxc',
      mxc,
      body: filename,
      info: content.info,
      encInfo: content.file,
      video: true,
    };
  }

  if (msgType === MsgType.Text || msgType === MsgType.Notice) {
    const ooye = parseOoyeGif(content, mediaEmbedHosts);
    if (ooye) {
      return { kind: 'url', title: ooye.title, videoUrl: ooye.videoUrl, pageUrl: ooye.pageUrl };
    }
  }

  return undefined;
};

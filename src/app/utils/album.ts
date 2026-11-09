import { IContent } from 'matrix-js-sdk';

/**
 * Fork-only. A message with several files is sent as one event per file, all
 * tagged with the same album id. Pinniped draws consecutive events from one
 * sender with the same id as a single grid; other clients show them one by one.
 */
export const ALBUM_CONTENT_KEY = 'club.stablecat.pinniped.album';

export const getAlbumId = (content: IContent): string | undefined => {
  const id = content[ALBUM_CONTENT_KEY];
  return typeof id === 'string' && id !== '' ? id : undefined;
};

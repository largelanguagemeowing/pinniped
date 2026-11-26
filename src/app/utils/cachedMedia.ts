import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { MatrixClient } from 'matrix-js-sdk';
import { decryptFile, downloadEncryptedMedia, downloadMedia, mxcUrlToHttp } from './matrix';
import { mediaBlobCache } from './mediaBlobCache';
import { mediaProgress } from './mediaProgress';

// Loads the media of a Matrix content URI through the media cache: one download (and decryption)
// per media however many views ask for it, its progress published for all of them.

export type MediaSize =
  | { kind: 'original' }
  | { kind: 'thumbnail'; width: number; height: number; method: 'scale' | 'crop' };

export type MediaRequest =
  /** Unencrypted media, in the size asked for. */
  | { encrypted: false; mxc: string; size: MediaSize }
  /**
   * Encrypted media: always the original, which a server cannot scale. `mimeType` becomes the
   * type of the decrypted blob.
   */
  | { encrypted: true; mxc: string; info: EncryptedAttachmentInfo; mimeType: string };

export type LoadMediaOptions = {
  useAuthentication: boolean;
  /** Stops waiting; the download itself stops once nothing else waits for it. */
  signal?: AbortSignal;
};

/** Where a request is fetched from; null for a URI the client does not accept as media. */
export const mediaHttpUrl = (
  mx: MatrixClient,
  request: MediaRequest,
  useAuthentication: boolean
): string | null => {
  if (request.encrypted || request.size.kind === 'original') {
    return mxcUrlToHttp(mx, request.mxc, useAuthentication);
  }
  const { width, height, method } = request.size;
  return mxcUrlToHttp(mx, request.mxc, useAuthentication, width, height, method);
};

const sha256Hex = async (text: string): Promise<string> => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

// A key names everything the cached blob depends on: whose session loaded it, the media, and its
// size or how it was decrypted into which type. The encryption info comes from an event, so
// events that name one file with different keys must not answer each other; it is hashed, which
// keeps the key itself out of the cache's index.
const cacheKey = async (account: string, request: MediaRequest): Promise<string> => {
  if (request.encrypted) {
    const decryption = await sha256Hex(JSON.stringify([request.info, request.mimeType]));
    return JSON.stringify([account, request.mxc, 'encrypted', decryption]);
  }
  const { size } = request;
  return JSON.stringify(
    size.kind === 'original'
      ? [account, request.mxc, 'original']
      : [account, request.mxc, 'thumbnail', size.width, size.height, size.method]
  );
};

const download = async (
  httpUrl: string,
  request: MediaRequest,
  signal: AbortSignal
): Promise<Blob> => {
  const tracker = mediaProgress.begin(httpUrl);
  const options = { signal, onProgress: tracker.report };
  try {
    return request.encrypted
      ? await downloadEncryptedMedia(
          httpUrl,
          (buffer) => decryptFile(buffer, request.mimeType, request.info),
          options
        )
      : await downloadMedia(httpUrl, options);
  } finally {
    tracker.end();
  }
};

// settles with the promise, or rejects as soon as the signal aborts after running `onAbort`
const untilAborted = <T>(
  promise: Promise<T>,
  signal: AbortSignal,
  onAbort: () => void
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const abort = () => {
      onAbort();
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });

/**
 * The media as a blob the media cache owns: `useObjectURL` shows it through the cache's URL, and
 * loading it again gives the same blob without a download while the cache has it.
 */
export const loadMedia = async (
  mx: MatrixClient,
  request: MediaRequest,
  options: LoadMediaOptions
): Promise<Blob> => {
  const { useAuthentication, signal } = options;
  const httpUrl = mediaHttpUrl(mx, request, useAuthentication);
  if (!httpUrl) throw new Error('Invalid media URL');
  signal?.throwIfAborted();
  const key = await cacheKey(mx.getSafeUserId(), request);
  signal?.throwIfAborted();

  const pending = mediaBlobCache.request(key, (abort) => download(httpUrl, request, abort));
  try {
    // released within the abort, so a download nothing else waits for stops at once
    return await (signal ? untilAborted(pending.blob, signal, pending.release) : pending.blob);
  } finally {
    pending.release();
  }
};

/**
 * Forgets a loaded blob that could not be shown (an image or video element failed on it), so a
 * retry downloads it again instead of getting the same blob back.
 */
export const discardMedia = (blob: Blob): void => mediaBlobCache.discard(blob);

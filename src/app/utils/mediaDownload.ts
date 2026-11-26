// Reads a media response in chunks, so a download can say how far it is and be stopped.

/** How much of a download has arrived. A server does not have to announce the length. */
export type DownloadProgress =
  { length: 'known'; loaded: number; total: number } | { length: 'unknown'; loaded: number };

export type DownloadProgressHandler = (progress: DownloadProgress) => void;

export type ReadOptions = {
  /** Without a listener the body is read by the browser in one piece. */
  onProgress?: DownloadProgressHandler;
  signal?: AbortSignal;
};

/** An unannounced length is reported each time this many more bytes have arrived, and at the end. */
export const UNKNOWN_LENGTH_STEP = 256 * 1024;

const announcedLength = (res: Response): number | undefined => {
  const header = res.headers.get('content-length');
  if (header === null || !/^\d+$/.test(header)) return undefined;
  const length = Number(header);
  return Number.isSafeInteger(length) ? length : undefined;
};

const readChunks = async (
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  announced: number | undefined,
  onProgress: DownloadProgressHandler,
  signal: AbortSignal | undefined
): Promise<Uint8Array<ArrayBuffer>[]> => {
  const reader = body.getReader();
  // an aborted request fails the read by itself; cancelling also stops a body that is not tied
  // to the signal (one a service worker or a custom protocol made)
  const cancel = () => {
    reader.cancel(signal?.reason).catch(() => undefined);
  };
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });

  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = announced;
  let loaded = 0;
  let reported = 0;
  try {
    signal?.throwIfAborted();
    onProgress(
      total === undefined ? { length: 'unknown', loaded } : { length: 'known', loaded, total }
    );
    for (;;) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      // the header counted something other than these bytes (a compressed transfer)
      if (total !== undefined && loaded > total) total = undefined;
      if (total !== undefined) {
        onProgress({ length: 'known', loaded, total });
      } else if (
        Math.floor(loaded / UNKNOWN_LENGTH_STEP) > Math.floor(reported / UNKNOWN_LENGTH_STEP)
      ) {
        reported = loaded;
        onProgress({ length: 'unknown', loaded });
      }
    }
    if (total === undefined && reported !== loaded) onProgress({ length: 'unknown', loaded });
    return chunks;
  } finally {
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
};

/** The response body as a blob of the response's content type. */
export const responseBlob = async (res: Response, options: ReadOptions): Promise<Blob> => {
  const { onProgress, signal } = options;
  if (!onProgress || !res.body) return res.blob();
  const chunks = await readChunks(res.body, announcedLength(res), onProgress, signal);
  return new Blob(chunks, { type: res.headers.get('content-type') ?? '' });
};

/** The response body as one buffer. */
export const responseBuffer = async (res: Response, options: ReadOptions): Promise<ArrayBuffer> => {
  const { onProgress, signal } = options;
  if (!onProgress || !res.body) return res.arrayBuffer();
  const chunks = await readChunks(res.body, announcedLength(res), onProgress, signal);
  const bytes = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.byteLength, 0));
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return bytes.buffer;
};

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

type Chunk = Uint8Array<ArrayBuffer>;

// hands each chunk of the body to `take` as it arrives
const readChunks = async (
  body: ReadableStream<Chunk>,
  announced: number | undefined,
  onProgress: DownloadProgressHandler,
  signal: AbortSignal | undefined,
  take: (chunk: Chunk) => void
): Promise<void> => {
  const reader = body.getReader();
  // an aborted request fails the read by itself; cancelling also stops a body that is not tied
  // to the signal (one a service worker or a custom protocol made)
  const cancel = () => {
    reader.cancel(signal?.reason).catch(() => undefined);
  };
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });

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
      take(value);
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
  } finally {
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
};

/** Chunks are folded into the blob each time this many bytes of them have gathered. */
export const BLOB_BATCH_BYTES = 8 * 1024 * 1024;

/** The response body as a blob of the response's content type. */
export const responseBlob = async (res: Response, options: ReadOptions): Promise<Blob> => {
  const { onProgress, signal } = options;
  if (!onProgress || !res.body) return res.blob();

  // Folded in batches: a blob's bytes are the browser's to store, so the script holds one batch
  // of a large file instead of all of it twice.
  const type = res.headers.get('content-type') ?? '';
  let blob = new Blob([], { type });
  let batch: Chunk[] = [];
  let batchBytes = 0;
  const fold = () => {
    blob = new Blob([blob, ...batch], { type });
    batch = [];
    batchBytes = 0;
  };
  await readChunks(res.body, announcedLength(res), onProgress, signal, (chunk) => {
    batch.push(chunk);
    batchBytes += chunk.byteLength;
    if (batchBytes >= BLOB_BATCH_BYTES) fold();
  });
  fold();
  return blob;
};

/** The response body as one buffer. */
export const responseBuffer = async (res: Response, options: ReadOptions): Promise<ArrayBuffer> => {
  const { onProgress, signal } = options;
  if (!onProgress || !res.body) return res.arrayBuffer();

  // filled in place: exactly the announced length, else doubled as the body outgrows it
  const announced = announcedLength(res);
  let bytes = new Uint8Array(announced ?? 0);
  let loaded = 0;
  await readChunks(res.body, announced, onProgress, signal, (chunk) => {
    const needed = loaded + chunk.byteLength;
    if (needed > bytes.byteLength) {
      const grown = new Uint8Array(Math.max(needed, bytes.byteLength * 2));
      grown.set(bytes.subarray(0, loaded));
      bytes = grown;
    }
    bytes.set(chunk, loaded);
    loaded = needed;
  });
  return loaded === bytes.byteLength ? bytes.buffer : bytes.slice(0, loaded).buffer;
};

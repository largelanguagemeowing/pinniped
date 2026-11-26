import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadEncryptedMedia, downloadMedia } from '../../src/app/utils/matrix';
import {
  BLOB_BATCH_BYTES,
  DownloadProgress,
  UNKNOWN_LENGTH_STEP,
  responseBlob,
  responseBuffer,
} from '../../src/app/utils/mediaDownload';

vi.mock('../../src/app/state/sessions', () => ({ getFallbackSession: () => undefined }));

const bytes = (length: number, value = 7) => new Uint8Array(length).fill(value);

// a response whose body arrives as the given chunks; one with `onCancel` stays open after them
const streamed = (
  chunks: Uint8Array[],
  headers: Record<string, string> = {},
  onCancel?: () => void
): Response => {
  const pending = [...chunks];
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = pending.shift();
      if (chunk) controller.enqueue(chunk);
      else if (!onCancel) controller.close();
    },
    cancel: onCancel,
  });
  return new Response(body, { headers });
};

const collect = () => {
  const reports: DownloadProgress[] = [];
  return { reports, onProgress: (progress: DownloadProgress) => reports.push(progress) };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reading a media response', () => {
  it('reports the bytes that arrived against the announced length', async () => {
    const { reports, onProgress } = collect();
    const res = streamed([bytes(40), bytes(40), bytes(20)], {
      'content-length': '100',
      'content-type': 'image/png',
    });

    const blob = await responseBlob(res, { onProgress });

    expect(reports[0]).toEqual({ length: 'known', loaded: 0, total: 100 });
    expect(reports.at(-1)).toEqual({ length: 'known', loaded: 100, total: 100 });
    const loaded = reports.map((report) => report.loaded);
    expect(loaded).toEqual([...loaded].sort((a, b) => a - b));
    expect(blob.size).toBe(100);
    expect(blob.type).toBe('image/png');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes(100));
  });

  it('reports an unannounced length in steps instead of per chunk', async () => {
    const { reports, onProgress } = collect();
    const chunk = UNKNOWN_LENGTH_STEP / 4;
    // ten quarter steps: two and a half steps of bytes
    const res = streamed(Array.from({ length: 10 }, () => bytes(chunk)));

    const blob = await responseBlob(res, { onProgress });

    expect(reports).toEqual([
      { length: 'unknown', loaded: 0 },
      { length: 'unknown', loaded: UNKNOWN_LENGTH_STEP },
      { length: 'unknown', loaded: UNKNOWN_LENGTH_STEP * 2 },
      { length: 'unknown', loaded: chunk * 10 },
    ]);
    expect(blob.size).toBe(chunk * 10);
  });

  it('stops trusting an announced length the body outgrows', async () => {
    const { reports, onProgress } = collect();
    // what a compressed transfer looks like: the header counts the bytes on the wire
    const res = streamed([bytes(30), bytes(30)], { 'content-length': '40' });

    await responseBlob(res, { onProgress });

    expect(reports).toEqual([
      { length: 'known', loaded: 0, total: 40 },
      { length: 'known', loaded: 30, total: 40 },
      { length: 'unknown', loaded: 60 },
    ]);
  });

  it('treats a length that is not a byte count as unannounced', async () => {
    const { reports, onProgress } = collect();

    await responseBlob(streamed([bytes(3)], { 'content-length': 'many' }), { onProgress });

    expect(reports.every((report) => report.length === 'unknown')).toBe(true);
  });

  it('gives the same bytes as a buffer', async () => {
    const { reports, onProgress } = collect();
    const res = streamed([bytes(2, 1), bytes(3, 2)], { 'content-length': '5' });

    const buffer = await responseBuffer(res, { onProgress });

    expect(new Uint8Array(buffer)).toEqual(new Uint8Array([1, 1, 2, 2, 2]));
    expect(reports.at(-1)).toEqual({ length: 'known', loaded: 5, total: 5 });
  });

  it('keeps a body of several batches whole and in order', async () => {
    const { onProgress } = collect();
    const half = BLOB_BATCH_BYTES / 2;
    // two and a half batches, each half batch filled with its own value
    const res = streamed(
      Array.from({ length: 5 }, (_, index) => bytes(half, index + 1)),
      { 'content-type': 'video/mp4' }
    );

    const blob = await responseBlob(res, { onProgress });

    expect(blob.size).toBe(half * 5);
    expect(blob.type).toBe('video/mp4');
    const edges = await Promise.all(
      [0, 1, 2, 3, 4].map(async (index) => {
        const part = new Uint8Array(
          await blob.slice(half * index, half * (index + 1)).arrayBuffer()
        );
        return [part[0], part[half - 1]];
      })
    );
    expect(edges).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
    ]);
  });

  it('gives a body of any length as one buffer of exactly its bytes', async () => {
    const { onProgress } = collect();
    const chunks = () => [bytes(3, 1), bytes(70_000, 2), bytes(5, 3)];
    const expected = new Uint8Array([...bytes(3, 1), ...bytes(70_000, 2), ...bytes(5, 3)]);

    const unannounced = await responseBuffer(streamed(chunks()), { onProgress });
    const outgrown = await responseBuffer(streamed(chunks(), { 'content-length': '10' }), {
      onProgress,
    });
    const cutShort = await responseBuffer(streamed(chunks(), { 'content-length': '90000' }), {
      onProgress,
    });

    [unannounced, outgrown, cutShort].forEach((buffer) =>
      expect(new Uint8Array(buffer)).toEqual(expected)
    );
  });

  it('reads the body without a listener too', async () => {
    const blob = await responseBlob(streamed([bytes(8)], { 'content-type': 'video/mp4' }), {});
    const buffer = await responseBuffer(streamed([bytes(8)]), {});

    expect(blob.size).toBe(8);
    expect(blob.type).toBe('video/mp4');
    expect(buffer.byteLength).toBe(8);
  });

  it('stops the transfer when aborted', async () => {
    const { reports, onProgress } = collect();
    const controller = new AbortController();
    const cancelled = vi.fn();
    const res = streamed([bytes(10)], { 'content-length': '100' }, cancelled);

    const reading = responseBlob(res, { onProgress, signal: controller.signal });
    await vi.waitFor(() => expect(reports.at(-1)?.loaded).toBe(10));
    controller.abort();

    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).toHaveBeenCalled();
  });

  it('reads nothing when aborted beforehand', async () => {
    const { reports, onProgress } = collect();
    const cancelled = vi.fn();
    const res = streamed([bytes(10)], { 'content-length': '10' }, cancelled);

    await expect(
      responseBlob(res, { onProgress, signal: AbortSignal.abort() })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(reports).toEqual([]);
    expect(cancelled).toHaveBeenCalled();
  });
});

describe('downloadMedia', () => {
  const src = 'https://hs.example/_matrix/client/v1/media/download/hs.example/abc';

  it('reports progress and hands the abort signal to the request', async () => {
    const { reports, onProgress } = collect();
    const controller = new AbortController();
    const fetchMock = vi.fn(async () =>
      streamed([bytes(4), bytes(4)], { 'content-length': '8', 'content-type': 'image/gif' })
    );
    vi.stubGlobal('fetch', fetchMock);

    const blob = await downloadMedia(src, { onProgress, signal: controller.signal });

    expect(fetchMock).toHaveBeenCalledWith(
      src,
      expect.objectContaining({ signal: controller.signal })
    );
    expect(reports.at(-1)).toEqual({ length: 'known', loaded: 8, total: 8 });
    expect(blob.type).toBe('image/gif');
    expect(blob.size).toBe(8);
  });

  it('rejects when the request is aborted before it is answered', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', (_src: string, init: RequestInit) => {
      init.signal?.throwIfAborted();
      return new Promise(() => undefined);
    });
    controller.abort();

    await expect(downloadMedia(src, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('fails on an error status without reading the body', async () => {
    vi.stubGlobal('fetch', async () => new Response('gone', { status: 404 }));

    await expect(downloadMedia(src)).rejects.toThrow('404');
  });
});

describe('downloadEncryptedMedia', () => {
  it('reports the download and decrypts what arrived', async () => {
    const { reports, onProgress } = collect();
    vi.stubGlobal('fetch', async () =>
      streamed([bytes(3, 1), bytes(3, 2)], { 'content-length': '6' })
    );
    const decrypt = vi.fn(async (buf: ArrayBuffer) => new Blob([buf], { type: 'image/png' }));

    const blob = await downloadEncryptedMedia('https://hs.example/media', decrypt, { onProgress });

    expect(new Uint8Array(decrypt.mock.calls[0][0])).toEqual(new Uint8Array([1, 1, 1, 2, 2, 2]));
    expect(reports.at(-1)).toEqual({ length: 'known', loaded: 6, total: 6 });
    expect(blob.type).toBe('image/png');
  });
});

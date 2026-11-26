import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptAttachment, EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import type { MatrixClient } from 'matrix-js-sdk';
import {
  MediaRequest,
  discardMedia,
  loadMedia,
  mediaHttpUrl,
} from '../../src/app/utils/cachedMedia';
import { AttachmentUnreadableError } from '../../src/app/utils/matrix';
import { mediaBlobCache } from '../../src/app/utils/mediaBlobCache';
import { mediaProgress } from '../../src/app/utils/mediaProgress';

vi.mock('../../src/app/state/sessions', () => ({ getFallbackSession: () => undefined }));

// the encryption library reads `window.crypto`; Node's WebCrypto is the same API
const previousWindow = (globalThis as { window?: unknown }).window;
beforeAll(() => {
  (globalThis as { window?: unknown }).window = {
    crypto: globalThis.crypto,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
  };
});
afterAll(() => {
  (globalThis as { window?: unknown }).window = previousWindow;
});

const client = (userId: string) =>
  ({
    getSafeUserId: () => userId,
    mxcUrlToHttp: (mxc: string, width?: number, height?: number, method?: string) => {
      if (!mxc.startsWith('mxc://')) return '';
      const id = mxc.slice('mxc://'.length);
      return width === undefined
        ? `https://hs.example/_matrix/client/v1/media/download/${id}`
        : `https://hs.example/_matrix/client/v1/media/thumbnail/${id}?width=${width}&height=${height}&method=${method}`;
    },
  }) as unknown as MatrixClient;

const mx = client('@alice:hs.example');
const options = { useAuthentication: true };

let media = 0;
// a media nothing has loaded yet
const plain = (): MediaRequest => {
  media += 1;
  return { encrypted: false, mxc: `mxc://hs.example/plain${media}`, size: { kind: 'original' } };
};

const text = (value: string) => new TextEncoder().encode(value);
const respond = (body: Uint8Array | ArrayBuffer, type = 'image/png') =>
  new Response(body, {
    headers: { 'content-type': type, 'content-length': String(body.byteLength) },
  });

// what the server holds per URL; every request is recorded
let served: Map<string, () => Response>;
let fetched: { url: string; signal: AbortSignal | undefined }[];

beforeEach(() => {
  served = new Map();
  fetched = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    fetched.push({ url, signal: init?.signal ?? undefined });
    return served.get(url)?.() ?? new Response('missing', { status: 404 });
  });
});

afterEach(() => {
  mediaBlobCache.clear();
  expect(mediaBlobCache.usage()).toEqual({ inUse: 0, kept: 0, keptBytes: 0 });
  vi.unstubAllGlobals();
});

const serve = (request: MediaRequest, body: Uint8Array | ArrayBuffer, type?: string): string => {
  const url = mediaHttpUrl(mx, request, true);
  if (!url) throw new Error('no URL');
  served.set(url, () => respond(body, type));
  return url;
};

// a request the server does not answer until the test says so
const stall = (request: MediaRequest, body: Uint8Array) => {
  const url = mediaHttpUrl(mx, request, true) ?? '';
  const { promise, resolve } = Promise.withResolvers<Response>();
  vi.stubGlobal('fetch', (fetchedUrl: string, init?: RequestInit) => {
    fetched.push({ url: fetchedUrl, signal: init?.signal ?? undefined });
    return new Promise<Response>((answer, fail) => {
      init?.signal?.addEventListener('abort', () => fail(init.signal?.reason));
      promise.then(answer);
    });
  });
  return { url, answer: () => resolve(respond(body)) };
};

describe('loadMedia', () => {
  it('downloads a media once and answers later loads from memory', async () => {
    const request = plain();
    serve(request, text('picture'));

    const first = await loadMedia(mx, request, options);
    const second = await loadMedia(mx, request, options);

    expect(await first.text()).toBe('picture');
    expect(first.type).toBe('image/png');
    expect(second).toBe(first);
    expect(fetched).toHaveLength(1);
  });

  it('shares one download between loads that overlap', async () => {
    const request = plain();
    serve(request, text('picture'));

    const [first, second] = await Promise.all([
      loadMedia(mx, request, options),
      loadMedia(mx, request, options),
    ]);

    expect(second).toBe(first);
    expect(fetched).toHaveLength(1);
  });

  it('downloads again after a failure', async () => {
    const request = plain();

    await expect(loadMedia(mx, request, options)).rejects.toThrow('404');
    serve(request, text('picture'));

    expect(await (await loadMedia(mx, request, options)).text()).toBe('picture');
    expect(fetched).toHaveLength(2);
  });

  it('downloads again once the loaded blob was discarded as unusable', async () => {
    const request = plain();
    serve(request, text('picture'));
    const bad = await loadMedia(mx, request, options);

    discardMedia(bad);
    const fresh = await loadMedia(mx, request, options);

    expect(fresh).not.toBe(bad);
    expect(fetched).toHaveLength(2);
  });

  it('rejects an address that is not a media address without asking the server', async () => {
    const request: MediaRequest = {
      encrypted: false,
      mxc: 'https://elsewhere.example/a.png',
      size: { kind: 'original' },
    };

    await expect(loadMedia(mx, request, options)).rejects.toThrow();
    expect(fetched).toHaveLength(0);
  });

  it('keeps the media of different accounts apart', async () => {
    const request = plain();
    serve(request, text('picture'));

    const mine = await loadMedia(mx, request, options);
    const theirs = await loadMedia(client('@bob:hs.example'), request, options);

    expect(theirs).not.toBe(mine);
    expect(fetched).toHaveLength(2);
  });

  it('keeps a thumbnail apart from the original and from other sizes', async () => {
    const original = plain();
    const thumbnail = (width: number): MediaRequest => ({
      encrypted: false,
      mxc: original.mxc,
      size: { kind: 'thumbnail', width, height: 600, method: 'scale' },
    });
    serve(original, text('original'));
    const smallUrl = serve(thumbnail(800), text('small'));
    serve(thumbnail(400), text('smaller'));

    const loaded = await Promise.all(
      [original, thumbnail(800), thumbnail(400), thumbnail(800)].map((request) =>
        loadMedia(mx, request, options).then((blob) => blob.text())
      )
    );

    expect(loaded).toEqual(['original', 'small', 'smaller', 'small']);
    expect(smallUrl).toContain('width=800');
    expect(fetched).toHaveLength(3);
  });

  describe('encrypted media', () => {
    const encrypted = async (value: string, mimeType = 'image/png') => {
      media += 1;
      const { data, info } = await encryptAttachment(text(value).slice().buffer);
      const request: MediaRequest = {
        encrypted: true,
        mxc: `mxc://hs.example/enc${media}`,
        info,
        mimeType,
      };
      serve(request, data, 'application/octet-stream');
      return { request, info };
    };

    it('decrypts once and answers later loads with the decrypted blob', async () => {
      const { request } = await encrypted('secret picture');

      const first = await loadMedia(mx, request, options);
      const second = await loadMedia(mx, request, options);

      expect(await first.text()).toBe('secret picture');
      expect(first.type).toBe('image/png');
      expect(second).toBe(first);
      expect(fetched).toHaveLength(1);
    });

    it('does not answer one key with what another decrypted', async () => {
      const { request, info } = await encrypted('secret picture');
      const other = await encryptAttachment(text('x').slice().buffer);
      // the same file and hash, another key: an event that does not belong to this media
      const forged: MediaRequest = {
        ...request,
        info: { ...info, key: other.info.key } as EncryptedAttachmentInfo,
      };

      const garbled = await loadMedia(mx, forged, options);
      const real = await loadMedia(mx, request, options);

      expect(await real.text()).toBe('secret picture');
      expect(real).not.toBe(garbled);
    });

    it('does not answer one blob type with a blob of another', async () => {
      const { request } = await encrypted('<b>markup</b>', 'text/plain');

      const asText = await loadMedia(mx, request, options);
      const asHtml = await loadMedia(mx, { ...request, mimeType: 'text/html' }, options);

      expect(asText.type).toBe('text/plain');
      expect(asHtml.type).toBe('text/html');
    });

    it('reports info that cannot decrypt as unreadable', async () => {
      const { request } = await encrypted('secret picture');
      const broken = { ...request, info: {} as EncryptedAttachmentInfo };

      await expect(loadMedia(mx, broken, options)).rejects.toBeInstanceOf(
        AttachmentUnreadableError
      );
    });
  });

  describe('progress', () => {
    it('shows the download under the address it is fetched from, until it ends', async () => {
      const request = plain();
      const { url, answer } = stall(request, text('picture'));
      const seen: string[] = [];
      mediaProgress.subscribe(url, () => {
        const state = mediaProgress.get(url);
        seen.push(state.status === 'loading' ? `${state.progress.loaded}` : state.status);
      });

      const loading = loadMedia(mx, request, options);
      await vi.waitFor(() => expect(mediaProgress.get(url).status).toBe('loading'));
      answer();
      await loading;

      expect(seen.at(-2)).toBe('7');
      expect(seen.at(-1)).toBe('idle');
    });

    it('is idle again after a failed download', async () => {
      const request = plain();
      const url = mediaHttpUrl(mx, request, true) ?? '';

      await expect(loadMedia(mx, request, options)).rejects.toThrow();

      expect(mediaProgress.get(url)).toEqual({ status: 'idle' });
    });
  });

  describe('abort', () => {
    it('stops the download when the only load of it is aborted', async () => {
      const request = plain();
      stall(request, text('picture'));
      const controller = new AbortController();

      const loading = loadMedia(mx, request, { ...options, signal: controller.signal });
      await vi.waitFor(() => expect(fetched).toHaveLength(1));
      controller.abort();

      await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
      expect(fetched[0].signal?.aborted).toBe(true);
    });

    it('lets the download finish for another load that still waits', async () => {
      const request = plain();
      const { answer } = stall(request, text('picture'));
      const controller = new AbortController();

      const aborted = loadMedia(mx, request, { ...options, signal: controller.signal });
      const waiting = loadMedia(mx, request, options);
      await vi.waitFor(() => expect(fetched).toHaveLength(1));
      controller.abort();

      await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
      expect(fetched[0].signal?.aborted).toBe(false);
      answer();
      expect(await (await waiting).text()).toBe('picture');
    });

    it('does not start a download for a load that was aborted beforehand', async () => {
      const request = plain();
      serve(request, text('picture'));

      await expect(
        loadMedia(mx, request, { ...options, signal: AbortSignal.abort() })
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(fetched).toHaveLength(0);
    });
  });
});

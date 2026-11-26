import { describe, expect, it, vi } from 'vitest';
import { BlobCache, BlobCacheLimits } from '../../src/app/utils/mediaBlobCache';

const blobOf = (size: number) => new Blob([new Uint8Array(size)]);

// a cache whose object URLs are recorded: `live` holds those created and not revoked yet
const setup = (limits: BlobCacheLimits = { maxEntries: 8, maxBytes: 1000 }) => {
  const live = new Set<string>();
  let created = 0;
  const cache = new BlobCache(limits, {
    create: () => {
      created += 1;
      const url = `blob:test/${created}`;
      live.add(url);
      return url;
    },
    revoke: (url) => live.delete(url),
  });

  // loads `key` and lets go of it again, so it is kept without a holder
  const load = async (key: string, size = 1): Promise<Blob> => {
    const request = cache.request(key, async () => blobOf(size));
    const blob = await request.blob;
    request.release();
    return blob;
  };
  // whether the cache still has `key`: a kept entry answers without loading
  const has = async (key: string): Promise<boolean> => {
    const loader = vi.fn(async () => blobOf(1));
    const request = cache.request(key, loader);
    await request.blob;
    request.release();
    return loader.mock.calls.length === 0;
  };

  return { cache, live, load, has, created: () => created };
};

// a load the test settles by hand
const deferred = () => {
  const { promise, resolve, reject } = Promise.withResolvers<Blob>();
  const signals: AbortSignal[] = [];
  const loader = vi.fn((signal: AbortSignal) => {
    signals.push(signal);
    return promise;
  });
  return { loader, resolve, reject, signals };
};

describe('BlobCache', () => {
  it('loads a key once and answers later requests with the same blob', async () => {
    const { cache } = setup();
    const loader = vi.fn(async () => blobOf(4));

    const first = cache.request('a', loader);
    const blob = await first.blob;
    first.release();
    const second = cache.request('a', loader);

    expect(await second.blob).toBe(blob);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('shares one load between requests made while it runs', async () => {
    const { cache } = setup();
    const { loader, resolve } = deferred();

    const first = cache.request('a', loader);
    const second = cache.request('a', loader);
    const blob = blobOf(4);
    resolve(blob);

    expect(await first.blob).toBe(blob);
    expect(await second.blob).toBe(blob);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does not keep a failed load', async () => {
    const { cache, has } = setup();
    const { loader, reject } = deferred();

    const first = cache.request('a', loader);
    const second = cache.request('a', loader);
    reject(new Error('offline'));

    await expect(first.blob).rejects.toThrow('offline');
    await expect(second.blob).rejects.toThrow('offline');
    first.release();
    second.release();
    expect(cache.usage()).toEqual({ inUse: 0, kept: 0, keptBytes: 0 });
    expect(await has('a')).toBe(false);
  });

  it('gives every holder of a blob the same object URL, made when first held', async () => {
    const { cache, load, created, live } = setup();
    const blob = await load('a');
    expect(created()).toBe(0);

    const first = cache.hold(blob);
    const second = cache.hold(blob);

    expect(first?.url).toBeDefined();
    expect(second?.url).toBe(first?.url);
    expect([...live]).toEqual([first?.url]);
  });

  it('keeps a released blob and its URL for the next holder', async () => {
    const { cache, load, live } = setup();
    const blob = await load('a');

    const first = cache.hold(blob);
    first?.release();
    const second = cache.hold(blob);

    expect(second?.url).toBe(first?.url);
    expect(live.has(first?.url ?? '')).toBe(true);
  });

  it('does not hold a blob it did not load', () => {
    const { cache } = setup();

    expect(cache.hold(blobOf(1))).toBeUndefined();
  });

  it('evicts the least recently used blob beyond the entry limit and revokes its URL', async () => {
    const { cache, load, has, live } = setup({ maxEntries: 2, maxBytes: 1000 });
    const a = await load('a');
    const held = cache.hold(a);
    held?.release();
    await load('b');

    await load('c');

    expect(live.size).toBe(0);
    expect(cache.hold(a)).toBeUndefined();
    expect(await has('b')).toBe(true);
    expect(await has('c')).toBe(true);
    expect(await has('a')).toBe(false);
  });

  it('counts a use as recent', async () => {
    const { cache, load, has } = setup({ maxEntries: 2, maxBytes: 1000 });
    const a = await load('a');
    await load('b');

    cache.hold(a)?.release();
    await load('c');

    expect(await has('a')).toBe(true);
    expect(await has('b')).toBe(false);
  });

  it('evicts beyond the byte limit', async () => {
    const { cache, load, has } = setup({ maxEntries: 8, maxBytes: 10 });
    await load('a', 4);
    await load('b', 4);

    await load('c', 4);

    expect(cache.usage()).toMatchObject({ kept: 2, keptBytes: 8 });
    expect(await has('a')).toBe(false);
    expect(await has('c')).toBe(true);
  });

  it('never evicts a blob in use, and leaves it out of the limits', async () => {
    const { cache, load, has, live } = setup({ maxEntries: 2, maxBytes: 10 });
    const big = await load('big', 9);
    const held = cache.hold(big);

    await load('a', 4);
    await load('b', 4);
    await load('c', 4);

    // the held blob is neither evicted nor counted: two others fit beside it
    expect(live.has(held?.url ?? '')).toBe(true);
    expect(cache.usage()).toEqual({ inUse: 1, kept: 2, keptBytes: 8 });
    expect(cache.hold(big)?.url).toBe(held?.url);
    expect(await has('b')).toBe(true);
    expect(await has('c')).toBe(true);
  });

  it('applies the limits to a blob once nothing uses it', async () => {
    const { cache, load, has, live } = setup({ maxEntries: 1, maxBytes: 1000 });
    const a = await load('a');
    const held = cache.hold(a);
    await load('b');

    // released last, so it is the more recent of the two
    held?.release();

    expect([...live]).toEqual([held?.url]);
    expect(await has('a')).toBe(true);
    expect(await has('b')).toBe(false);
  });

  it('does not keep a blob larger than the byte limit, nor evict others for it', async () => {
    const { cache, load, has } = setup({ maxEntries: 8, maxBytes: 10 });
    await load('small', 4);
    const huge = await load('huge', 11);

    expect(cache.hold(huge)).toBeUndefined();
    expect(cache.usage()).toEqual({ inUse: 0, kept: 1, keptBytes: 4 });
    expect(await has('small')).toBe(true);
    expect(await has('huge')).toBe(false);
  });

  it('serves a blob larger than the byte limit while it is in use', async () => {
    const { cache, live } = setup({ maxEntries: 8, maxBytes: 10 });
    const request = cache.request('huge', async () => blobOf(11));
    const held = cache.hold(await request.blob);
    request.release();

    expect(live.has(held?.url ?? '')).toBe(true);
    expect(cache.hold(await cache.request('huge', async () => blobOf(1)).blob)?.url).toBe(
      held?.url
    );

    cache.clear();
    expect(live.has(held?.url ?? '')).toBe(true);
  });

  it('counts a release once', async () => {
    const { cache, load, live } = setup({ maxEntries: 1, maxBytes: 1000 });
    const a = await load('a');
    const first = cache.hold(a);
    const second = cache.hold(a);

    first?.release();
    first?.release();
    await load('b');

    expect(live.has(second?.url ?? '')).toBe(true);
    expect(cache.usage().inUse).toBe(1);
  });

  it('aborts a load nobody waits for any more and starts over on the next request', async () => {
    const { cache } = setup();
    const abandoned = deferred();

    const first = cache.request('a', abandoned.loader);
    const second = cache.request('a', abandoned.loader);
    first.blob.catch(() => undefined);
    second.blob.catch(() => undefined);
    first.release();
    expect(abandoned.signals[0].aborted).toBe(false);
    second.release();
    expect(abandoned.signals[0].aborted).toBe(true);

    const fresh = deferred();
    const third = cache.request('a', fresh.loader);
    const blob = blobOf(1);
    fresh.resolve(blob);

    expect(await third.blob).toBe(blob);
    expect(fresh.loader).toHaveBeenCalledTimes(1);
  });

  it('does not keep what an abandoned load still delivers', async () => {
    const { cache, has } = setup();
    const { loader, resolve } = deferred();

    const request = cache.request('a', loader);
    request.release();
    const late = blobOf(1);
    resolve(late);
    await request.blob;

    expect(cache.hold(late)).toBeUndefined();
    expect(cache.usage()).toEqual({ inUse: 0, kept: 0, keptBytes: 0 });
    expect(await has('a')).toBe(false);
  });

  it('forgets a discarded blob but keeps its URL alive for those still using it', async () => {
    const { cache, load, has, live } = setup();
    const bad = await load('a');
    const held = cache.hold(bad);

    cache.discard(bad);

    expect(live.has(held?.url ?? '')).toBe(true);
    expect(cache.hold(bad)).toBeUndefined();
    expect(await has('a')).toBe(false);

    held?.release();
    expect(live.has(held?.url ?? '')).toBe(false);
  });

  it('revokes the URL of a discarded blob nothing uses at once', async () => {
    const { cache, load, live } = setup();
    const bad = await load('a');
    cache.hold(bad)?.release();
    expect(live.size).toBe(1);

    cache.discard(bad);

    expect(live.size).toBe(0);
    expect(cache.usage()).toEqual({ inUse: 0, kept: 0, keptBytes: 0 });
  });

  it('does not let a discarded blob remove the one loaded in its place', async () => {
    const { cache, load, has } = setup();
    const bad = await load('a');
    const held = cache.hold(bad);
    cache.discard(bad);
    await load('a');

    held?.release();

    expect(await has('a')).toBe(true);
  });

  it('clears everything that is not in use and leaves no URL behind', async () => {
    const { cache, load, has, live, created } = setup();
    const a = await load('a');
    const b = await load('b');
    cache.hold(a)?.release();
    const held = cache.hold(b);

    cache.clear();

    expect([...live]).toEqual([held?.url]);
    expect(await has('a')).toBe(false);

    held?.release();
    cache.clear();
    expect(created()).toBe(2);
    expect(live.size).toBe(0);
  });
});

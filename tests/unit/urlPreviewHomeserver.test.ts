import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import { getUrlPreview, sdkPreviewCacheKey } from '../../src/app/utils/urlPreviewServer';
import { BACKOFF_BASE_MS, resetBackoff } from '../../src/app/utils/requestBackoff';

const URL_A = 'https://a.org/page#frag';
const TS = 1_700_000_012_345;

const clientWith = (getPreview: () => Promise<unknown>) => {
  const mx = {
    getUrlPreview: vi.fn(getPreview),
    urlPreviewCache: {} as Record<string, Promise<unknown>>,
  };
  return mx as typeof mx & MatrixClient;
};

describe('getUrlPreview on the homeserver', () => {
  beforeEach(resetBackoff);

  it('keys like the SDK: minute bucket, no fragment', () => {
    expect(sdkPreviewCacheKey(URL_A, TS)).toBe('1699999980000_https://a.org/page');
  });

  it('drops a failed preview from the SDK cache', async () => {
    const mx = clientWith(() => Promise.reject(new Error('502')));
    mx.urlPreviewCache[sdkPreviewCacheKey(URL_A, TS)] = Promise.reject(new Error('502'));
    mx.urlPreviewCache[sdkPreviewCacheKey(URL_A, TS)].catch(() => undefined);

    await expect(getUrlPreview(mx, URL_A, TS)).rejects.toThrow('502');

    expect(Object.keys(mx.urlPreviewCache)).toEqual([]);
  });

  it('does not ask again right after a failure', async () => {
    const mx = clientWith(() => Promise.reject(new Error('502')));

    await expect(getUrlPreview(mx, URL_A, TS)).rejects.toThrow('502');
    await expect(getUrlPreview(mx, URL_A, TS)).rejects.toThrow('failed a moment ago');

    expect(mx.getUrlPreview).toHaveBeenCalledTimes(1);
  });

  it('asks again once the wait is over, and after a success forgets the failure', async () => {
    vi.useFakeTimers();
    const mx = clientWith(() => Promise.resolve({ 'og:title': 'ok' }));
    mx.getUrlPreview.mockRejectedValueOnce(new Error('502'));

    await expect(getUrlPreview(mx, URL_A, TS)).rejects.toThrow('502');
    vi.advanceTimersByTime(BACKOFF_BASE_MS);

    await expect(getUrlPreview(mx, URL_A, TS)).resolves.toEqual({ 'og:title': 'ok' });
    await expect(getUrlPreview(mx, URL_A, TS)).resolves.toEqual({ 'og:title': 'ok' });
    vi.useRealTimers();
  });

  it('tolerates a URL the SDK cannot parse', async () => {
    const mx = clientWith(() => Promise.reject(new Error('bad url')));

    await expect(getUrlPreview(mx, 'not a url', TS)).rejects.toThrow('bad url');
  });
});

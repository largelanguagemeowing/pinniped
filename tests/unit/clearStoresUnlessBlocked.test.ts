// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import { clearStoresUnlessBlocked } from '../../src/client/initMatrix';

afterEach(() => vi.useRealTimers());

const clientWith = (clearStores: () => Promise<void>) =>
  ({ clearStores }) as unknown as MatrixClient;

describe('clearStoresUnlessBlocked', () => {
  it('resolves once the stores are cleared', async () => {
    const clearStores = vi.fn().mockResolvedValue(undefined);
    await clearStoresUnlessBlocked(clientWith(clearStores));
    expect(clearStores).toHaveBeenCalledTimes(1);
  });

  it('does not wait for a delete that another tab blocks', async () => {
    vi.useFakeTimers();
    // what the SDK does while another tab holds the database open: neither resolves nor rejects
    const done = vi.fn();
    clearStoresUnlessBlocked(clientWith(() => new Promise(() => undefined))).then(done);

    await vi.advanceTimersByTimeAsync(4000);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(done).toHaveBeenCalled();
  });

  it('carries on when clearing fails', async () => {
    await expect(
      clearStoresUnlessBlocked(clientWith(() => Promise.reject(new Error('denied'))))
    ).resolves.toBeUndefined();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MatrixError } from 'matrix-js-sdk';
import { assertAllSucceeded, rateLimitedActions } from '../../src/app/utils/matrix';

const forbidden = () => new MatrixError({ errcode: 'M_FORBIDDEN', error: 'nope' }, 403);
const limited = (retryAfterMs: number) =>
  new MatrixError(
    { errcode: 'M_LIMIT_EXCEEDED', error: 'slow', retry_after_ms: retryAfterMs },
    429
  );

describe('rateLimitedActions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports every item that failed with a non-429 error and still runs the rest', async () => {
    const callback = vi.fn(async (item: number) => {
      if (item === 2) throw forbidden();
    });

    const failures = await rateLimitedActions([1, 2, 3], callback);

    expect(callback).toHaveBeenCalledTimes(3);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ item: 2, index: 1 });
    expect(failures[0].error).toBeInstanceOf(MatrixError);
  });

  it('returns no failures when everything succeeded', async () => {
    expect(await rateLimitedActions([1, 2], async () => undefined)).toEqual([]);
  });

  it('retries a 429 after the server delay and reports success when the retry works', async () => {
    let calls = 0;
    const promise = rateLimitedActions(['a'], async () => {
      calls += 1;
      if (calls === 1) throw limited(1000);
    });

    await vi.runAllTimersAsync();

    expect(await promise).toEqual([]);
    expect(calls).toBe(2);
  });

  it('reports an item whose 429 retries ran out', async () => {
    const promise = rateLimitedActions(
      ['a'],
      async () => {
        throw limited(10);
      },
      1
    );

    await vi.runAllTimersAsync();

    const failures = await promise;
    expect(failures).toHaveLength(1);
    expect(failures[0].item).toBe('a');
  });
});

describe('assertAllSucceeded', () => {
  it('does nothing for no failures', () => {
    expect(() => assertAllSucceeded([])).not.toThrow();
  });

  it('throws with the count and the first server error', () => {
    const failures = [
      { item: 'a', index: 0, error: forbidden() },
      { item: 'b', index: 1, error: forbidden() },
    ];

    expect(() => assertAllSucceeded(failures)).toThrow(/2 actions failed: .*nope/);
  });
});

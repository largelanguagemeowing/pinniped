import { beforeEach, describe, expect, it } from 'vitest';
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  clearFailure,
  isBackedOff,
  recordFailure,
  resetBackoff,
} from '../../src/app/utils/requestBackoff';

describe('requestBackoff', () => {
  beforeEach(resetBackoff);

  it('leaves an unknown key alone', () => {
    expect(isBackedOff('a', 0)).toBe(false);
  });

  it('backs a failed key off until the wait is over', () => {
    recordFailure('a', 1000);
    expect(isBackedOff('a', 1000 + BACKOFF_BASE_MS - 1)).toBe(true);
    expect(isBackedOff('a', 1000 + BACKOFF_BASE_MS)).toBe(false);
  });

  it('doubles the wait per consecutive failure up to the cap', () => {
    recordFailure('a', 0);
    recordFailure('a', 0);
    expect(isBackedOff('a', 2 * BACKOFF_BASE_MS - 1)).toBe(true);
    expect(isBackedOff('a', 2 * BACKOFF_BASE_MS)).toBe(false);
    for (let i = 0; i < 40; i += 1) recordFailure('a', 0);
    expect(isBackedOff('a', BACKOFF_MAX_MS - 1)).toBe(true);
    expect(isBackedOff('a', BACKOFF_MAX_MS)).toBe(false);
  });

  it('forgets a key after a success', () => {
    recordFailure('a', 0);
    clearFailure('a');
    expect(isBackedOff('a', 1)).toBe(false);
    recordFailure('a', 0);
    // the count restarted, so the wait is the base again
    expect(isBackedOff('a', BACKOFF_BASE_MS)).toBe(false);
  });

  it('keeps keys independent', () => {
    recordFailure('a', 0);
    expect(isBackedOff('b', 1)).toBe(false);
  });
});

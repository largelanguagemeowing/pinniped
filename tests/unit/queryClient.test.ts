import { describe, expect, it } from 'vitest';
import {
  QUERY_STALE_TIME_MS,
  createQueryClient,
  shouldRetryQuery,
} from '../../src/app/queryClient';

const httpError = (httpStatus: number) => Object.assign(new Error('x'), { httpStatus });

describe('shouldRetryQuery', () => {
  it.each([400, 401, 403, 404])('does not retry a %i', (status) => {
    expect(shouldRetryQuery(0, httpError(status))).toBe(false);
  });

  it.each([408, 429, 500, 502, 504])('retries a %i', (status) => {
    expect(shouldRetryQuery(0, httpError(status))).toBe(true);
  });

  it('retries an error without a status (network)', () => {
    expect(shouldRetryQuery(0, new TypeError('Failed to fetch'))).toBe(true);
  });

  it('stops after a few attempts', () => {
    expect(shouldRetryQuery(2, httpError(502))).toBe(false);
  });

  it('copes with a non-object error', () => {
    expect(shouldRetryQuery(0, null)).toBe(true);
  });
});

describe('createQueryClient', () => {
  it('keeps answers fresh for a while by default', () => {
    expect(createQueryClient().getDefaultOptions().queries?.staleTime).toBe(QUERY_STALE_TIME_MS);
  });
});

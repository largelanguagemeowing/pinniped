import { describe, expect, it } from 'vitest';
import { MatrixError } from 'matrix-js-sdk';
import { readSessionEnd } from '../../src/client/sessionEnd';

const unknownToken = (data: Record<string, unknown>) =>
  new MatrixError({ errcode: 'M_UNKNOWN_TOKEN', ...data }, 401);

describe('readSessionEnd', () => {
  it('reads a soft logout, which keeps the device valid', () => {
    expect(
      readSessionEnd(unknownToken({ soft_logout: true, error: 'Access token has expired' }))
    ).toEqual({ soft: true, reason: 'Access token has expired' });
  });

  it('treats a missing or non-true soft_logout as a hard logout', () => {
    expect(readSessionEnd(unknownToken({ error: 'Unknown access token' })).soft).toBe(false);
    expect(readSessionEnd(unknownToken({ soft_logout: 'true' })).soft).toBe(false);
    expect(readSessionEnd(unknownToken({ soft_logout: false })).soft).toBe(false);
  });

  it('falls back to a generic reason', () => {
    expect(readSessionEnd(unknownToken({}))).toEqual({
      soft: false,
      reason: 'The server ended this session.',
    });
    expect(readSessionEnd(undefined)).toEqual({
      soft: false,
      reason: 'The server ended this session.',
    });
  });
});

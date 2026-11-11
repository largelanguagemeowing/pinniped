import { describe, expect, it } from 'vitest';
import { MatrixError } from 'matrix-js-sdk';
import {
  describeEmailTokenError,
  describeTokenStageError,
  suggestEmailFix,
} from '../../src/app/pages/auth/register/registerHelpers';

describe('suggestEmailFix', () => {
  it('fixes near-misses of common providers', () => {
    expect(suggestEmailFix('user@gmial.com')).toBe('user@gmail.com');
    expect(suggestEmailFix('user@gmx.ed')).toBe('user@gmx.de');
    expect(suggestEmailFix('user@outlok.com')).toBe('user@outlook.com');
  });

  it('leaves correct and unrelated domains alone', () => {
    expect(suggestEmailFix('user@gmail.com')).toBeUndefined();
    expect(suggestEmailFix('user@stablecat.club')).toBeUndefined();
    expect(suggestEmailFix('not-an-email')).toBeUndefined();
    expect(suggestEmailFix('user@')).toBeUndefined();
  });
});

describe('describeEmailTokenError', () => {
  it('explains Synapse’s generic SMTP failure as a likely typo', () => {
    const err = new MatrixError(
      { errcode: 'M_UNKNOWN', error: 'An error was encountered when sending the email' },
      500
    );
    const { title, message } = describeEmailTokenError(err, 'user@gmial.com');
    expect(title).toBe('Could not send the email');
    expect(message).toContain('user@gmial.com');
    expect(message).toMatch(/typo/);
  });

  it('names addresses that are already taken', () => {
    const err = new MatrixError({ errcode: 'M_THREEPID_IN_USE' }, 400);
    expect(describeEmailTokenError(err, 'a@b.c').title).toBe('Email already in use');
  });
});

describe('describeTokenStageError', () => {
  it('replaces the bare errcode title', () => {
    expect(describeTokenStageError('M_UNAUTHORIZED', 'Invalid registration token').title).toBe(
      'Token not accepted'
    );
  });
});

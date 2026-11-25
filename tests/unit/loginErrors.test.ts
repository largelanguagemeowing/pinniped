import { describe, expect, it, vi } from 'vitest';
import { MatrixError } from 'matrix-js-sdk';
import { LoginError, login } from '../../src/app/pages/auth/login/loginUtil';

const state = vi.hoisted(() => ({ failure: undefined as Error | undefined }));

vi.mock('matrix-js-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('matrix-js-sdk')>()),
  createClient: () => ({ loginRequest: async () => Promise.reject(state.failure) }),
}));

const failWith = async (errcode: string, status: number): Promise<string | undefined> => {
  state.failure = new MatrixError({ errcode, error: 'server text' }, status);
  try {
    await login('https://hs.example', { type: 'm.login.password' } as never);
  } catch (e) {
    return (e as MatrixError).errcode;
  }
  return undefined;
};

describe('login errors', () => {
  it('keeps a wrong password apart from an account the server holds back', async () => {
    expect(await failWith('M_FORBIDDEN', 403)).toBe(LoginError.Forbidden);
    expect(await failWith('ORG.MATRIX.MSC3866_USER_AWAITING_APPROVAL', 403)).toBe(
      LoginError.AwaitingApproval
    );
    expect(await failWith('M_CONSENT_NOT_GIVEN', 403)).toBe(LoginError.ConsentRequired);
    expect(await failWith('M_USER_SUSPENDED', 403)).toBe(LoginError.UserSuspended);
    expect(await failWith('M_USER_LOCKED', 401)).toBe(LoginError.UserLocked);
  });

  it('still reports deactivated, rate limited and unknown failures', async () => {
    expect(await failWith('M_USER_DEACTIVATED', 403)).toBe(LoginError.UserDeactivated);
    expect(await failWith('M_LIMIT_EXCEEDED', 429)).toBe(LoginError.RateLimited);
    expect(await failWith('M_UNKNOWN', 500)).toBe(LoginError.Unknown);
  });
});

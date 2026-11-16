import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import {
  PROFILE_FAILURE_TTL_MS,
  RecentProfileFailure,
  hasRecentProfileFailure,
  requestProfile,
} from '../../src/app/utils/profileRequests';

const clientWith = (getExtendedProfile: () => Promise<Record<string, unknown>>) =>
  ({ getExtendedProfile }) as unknown as MatrixClient;

describe('requestProfile', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shares one request between concurrent callers', async () => {
    const get = vi.fn().mockResolvedValue({ displayname: 'A' });
    const mx = clientWith(get);

    const [a, b] = await Promise.all([requestProfile(mx, '@a:x'), requestProfile(mx, '@a:x')]);

    expect(get).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('asks again after a success', async () => {
    const get = vi.fn().mockResolvedValue({});
    const mx = clientWith(get);

    await requestProfile(mx, '@a:x');
    await requestProfile(mx, '@a:x');

    expect(get).toHaveBeenCalledTimes(2);
  });

  it('does not ask again for a while after a failure', async () => {
    const get = vi.fn().mockRejectedValue(new Error('403'));
    const mx = clientWith(get);

    await expect(requestProfile(mx, '@a:x')).rejects.toThrow('403');
    await expect(requestProfile(mx, '@a:x')).rejects.toBeInstanceOf(RecentProfileFailure);

    expect(get).toHaveBeenCalledTimes(1);
    expect(hasRecentProfileFailure(mx, '@a:x')).toBe(true);
  });

  it('asks again once the failure is old enough', async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error('502')).mockResolvedValue({ ok: true });
    const mx = clientWith(get);

    await expect(requestProfile(mx, '@a:x')).rejects.toThrow('502');
    vi.advanceTimersByTime(PROFILE_FAILURE_TTL_MS);

    await expect(requestProfile(mx, '@a:x')).resolves.toEqual({ ok: true });
    expect(hasRecentProfileFailure(mx, '@a:x')).toBe(false);
  });

  it('uses the loader it is given', async () => {
    const mx = clientWith(vi.fn());
    const load = vi.fn().mockResolvedValue({ via: 'loader' });

    await expect(requestProfile(mx, '@a:x', load)).resolves.toEqual({ via: 'loader' });
    expect(load).toHaveBeenCalledWith('@a:x');
  });

  it('keeps clients and users apart', async () => {
    const failing = clientWith(vi.fn().mockRejectedValue(new Error('x')));
    const working = clientWith(vi.fn().mockResolvedValue({}));

    await expect(requestProfile(failing, '@a:x')).rejects.toThrow('x');

    await expect(requestProfile(working, '@a:x')).resolves.toEqual({});
    expect(hasRecentProfileFailure(failing, '@b:x')).toBe(false);
  });
});

import { MatrixClient, MatrixError, SetPresence } from 'matrix-js-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendPresence } from '../../src/app/state/statusMessage';

const rateLimited = (retryAfterMs: number) =>
  new MatrixError(
    { errcode: 'M_LIMIT_EXCEEDED', error: 'Too Many Requests', retry_after_ms: retryAfterMs },
    429
  );

const client = (setPresence: (body: { presence: string }) => Promise<unknown>) => {
  const mx = {
    setSyncPresence: vi.fn(async () => undefined),
    setPresence: vi.fn(setPresence),
    getAccountData: () => undefined,
  };
  return { mx, client: mx as unknown as MatrixClient };
};

describe('sendPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the choice with every sync too, since a sync without one counts as online', async () => {
    const { mx, client: mxClient } = client(async () => ({}));
    await sendPresence(mxClient, 'unavailable');
    expect(mx.setSyncPresence).toHaveBeenCalledWith(SetPresence.Unavailable);
    expect(mx.setPresence).toHaveBeenCalledWith({ presence: 'unavailable', status_msg: '' });
  });

  it('sends it again once the server lets it, when it was rate-limited', async () => {
    const { mx, client: mxClient } = client(async () => ({}));
    mx.setPresence.mockRejectedValueOnce(rateLimited(4000));

    let done = false;
    const sending = sendPresence(mxClient, 'online', 'at lunch').then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(3999);
    expect(mx.setPresence).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await sending;
    expect(mx.setPresence).toHaveBeenCalledTimes(2);
    expect(mx.setPresence).toHaveBeenLastCalledWith({ presence: 'online', status_msg: 'at lunch' });
  });

  it('gives way to a newer choice while it waits', async () => {
    const { mx, client: mxClient } = client(async () => ({}));
    mx.setPresence.mockRejectedValueOnce(rateLimited(4000));

    const away = sendPresence(mxClient, 'unavailable');
    await vi.advanceTimersByTimeAsync(0);
    await sendPresence(mxClient, 'online');
    await vi.advanceTimersByTimeAsync(4000);
    await away;

    expect(mx.setPresence.mock.calls.map(([body]) => body.presence)).toEqual([
      'unavailable',
      'online',
    ]);
  });

  it('fails on any other error', async () => {
    const { client: mxClient } = client(async () => {
      throw new MatrixError({ errcode: 'M_FORBIDDEN', error: 'no' }, 403);
    });
    await expect(sendPresence(mxClient, 'offline')).rejects.toThrow('no');
  });
});

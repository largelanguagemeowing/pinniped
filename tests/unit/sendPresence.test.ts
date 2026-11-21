import { MatrixClient, SetPresence } from 'matrix-js-sdk';
import { describe, expect, it, vi } from 'vitest';
import { sendPresence } from '../../src/app/state/statusMessage';

const client = (setPresence: (body: { presence: string }) => Promise<unknown>) => {
  const mx = {
    setSyncPresence: vi.fn(async () => undefined),
    setPresence: vi.fn(setPresence),
    getAccountData: () => undefined,
  };
  return { mx, client: mx as unknown as MatrixClient };
};

describe('sendPresence', () => {
  it('sends the choice with every sync too, since a sync without one counts as online', async () => {
    const { mx, client: mxClient } = client(async () => ({}));
    await sendPresence(mxClient, 'unavailable');
    expect(mx.setSyncPresence).toHaveBeenCalledWith(SetPresence.Unavailable);
    expect(mx.setPresence).toHaveBeenCalledWith({ presence: 'unavailable', status_msg: '' });
  });
});

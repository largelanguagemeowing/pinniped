import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import { inviteUser } from '../../src/app/utils/matrix';

const DM = '!dm:example.org';
const ROOM = '!room:example.org';

const client = (mDirect: Record<string, string[]> | undefined) => {
  const mx = {
    getAccountData: vi.fn(() => mDirect && { getContent: () => mDirect }),
    sendStateEvent: vi.fn(async () => ({ event_id: '$member' })),
    invite: vi.fn(async () => ({})),
  };
  return { mx, client: mx as unknown as MatrixClient };
};

describe('inviteUser', () => {
  it('marks an invite into a direct message as direct, so it is one for the invitee too', async () => {
    const { mx, client: c } = client({ '@bob:example.org': [DM] });

    await inviteUser(c, DM, '@carol:example.org', 'join us');

    expect(mx.sendStateEvent).toHaveBeenCalledWith(
      DM,
      'm.room.member',
      { membership: 'invite', is_direct: true, reason: 'join us' },
      '@carol:example.org'
    );
    expect(mx.invite).not.toHaveBeenCalled();
  });

  it('sends no reason when there is none', async () => {
    const { mx, client: c } = client({ '@bob:example.org': [DM] });

    await inviteUser(c, DM, '@carol:example.org');

    expect(mx.sendStateEvent).toHaveBeenCalledWith(
      DM,
      'm.room.member',
      { membership: 'invite', is_direct: true },
      '@carol:example.org'
    );
  });

  it('invites into other rooms plainly', async () => {
    for (const mDirect of [{ '@bob:example.org': [DM] }, undefined]) {
      const { mx, client: c } = client(mDirect);

      await inviteUser(c, ROOM, '@carol:example.org', 'hi');

      expect(mx.invite).toHaveBeenCalledWith(ROOM, '@carol:example.org', 'hi');
      expect(mx.sendStateEvent).not.toHaveBeenCalled();
    }
  });
});

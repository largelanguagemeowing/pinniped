import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import { inviteUsers } from '../../src/app/utils/invite';

const DM = '!dm:example.org';
const ROOM = '!room:example.org';
const GROUP = '!group:example.org';
const ME = '@me:example.org';
const BOB = '@bob:example.org';
const CAROL = '@carol:example.org';

const member = (userId: string, membership: string) => ({ userId, membership });

const client = (mDirect: Record<string, string[]> | undefined, members = [BOB]) => {
  const mx = {
    getSafeUserId: () => ME,
    getAccountData: vi.fn((type: string) =>
      type === 'm.direct' && mDirect ? { getContent: () => mDirect } : undefined
    ),
    getRoom: vi.fn(() => ({
      getMembers: () => [member(ME, 'join'), ...members.map((id) => member(id, 'join'))],
    })),
    createRoom: vi.fn(async () => ({ room_id: GROUP })),
    setAccountData: vi.fn(async () => ({})),
    sendStateEvent: vi.fn(async () => ({ event_id: '$member' })),
    invite: vi.fn(async () => ({})),
  };
  return { mx, client: mx as unknown as MatrixClient };
};

describe('inviteUsers', () => {
  it('starts a new encrypted group instead of adding to a one-to-one direct message', async () => {
    const { mx, client: c } = client({ [BOB]: [DM] });

    const target = await inviteUsers(c, DM, [CAROL], 'join us');

    expect(target).toBe(GROUP);
    expect(mx.createRoom).toHaveBeenCalledOnce();
    const opts = mx.createRoom.mock.calls[0][0] as unknown as {
      invite: string[];
      is_direct: boolean;
      power_level_content_override?: object;
      preset: string;
      initial_state: { type: string }[];
    };
    expect(opts.invite).toEqual([BOB]);
    // the group takes people in, and only its creator may kick or ban
    expect(opts.power_level_content_override).toMatchObject({ invite: 0, kick: 100, ban: 100 });
    expect(opts.preset).toBe('private_chat');
    expect(opts.is_direct).toBe(true);
    expect(opts.initial_state.map((e) => e.type)).toContain('m.room.encryption');
    expect(mx.sendStateEvent).toHaveBeenCalledWith(
      GROUP,
      'm.room.member',
      { membership: 'invite', is_direct: true, reason: 'join us' },
      CAROL
    );
    // the direct message itself is untouched
    expect(mx.invite).not.toHaveBeenCalled();
    expect(mx.sendStateEvent).not.toHaveBeenCalledWith(
      DM,
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect(mx.setAccountData).toHaveBeenCalledWith('m.direct', { [BOB]: [DM, GROUP] });
  });

  it('invites into a group direct message itself, as a direct message for the invitee', async () => {
    const dave = '@dave:example.org';
    const { mx, client: c } = client({ [BOB]: [DM] }, [BOB, dave]);

    expect(await inviteUsers(c, DM, [CAROL], 'join us')).toBe(DM);

    expect(mx.sendStateEvent).toHaveBeenCalledWith(
      DM,
      'm.room.member',
      { membership: 'invite', is_direct: true, reason: 'join us' },
      CAROL
    );
    expect(mx.createRoom).not.toHaveBeenCalled();
  });

  it('puts every invitee into the one new group', async () => {
    const { mx, client: c } = client({ [BOB]: [DM] });

    await inviteUsers(c, DM, [CAROL, '@dave:example.org']);

    expect(mx.createRoom).toHaveBeenCalledOnce();
    expect(mx.sendStateEvent).toHaveBeenCalledTimes(2);
  });

  it('does nothing when everyone is already in the direct message', async () => {
    const { mx, client: c } = client({ [BOB]: [DM] });

    expect(await inviteUsers(c, DM, [BOB])).toBe(DM);
    expect(mx.createRoom).not.toHaveBeenCalled();
    expect(mx.invite).not.toHaveBeenCalled();
  });

  it('invites into other rooms plainly', async () => {
    for (const mDirect of [{ [BOB]: [DM] }, undefined]) {
      const { mx, client: c } = client(mDirect);

      expect(await inviteUsers(c, ROOM, [CAROL], 'hi')).toBe(ROOM);

      expect(mx.invite).toHaveBeenCalledWith(ROOM, CAROL, 'hi');
      expect(mx.createRoom).not.toHaveBeenCalled();
    }
  });
});

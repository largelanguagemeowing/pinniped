import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import {
  createDirectChat,
  createDirectGroup,
  INVITE_LOCKED_LEVEL,
} from '../../src/app/utils/directRoom';

const ME = '@me:example.org';
const BOB = '@bob:example.org';
const CAROL = '@carol:example.org';

const client = () => {
  const mx = {
    createRoom: vi.fn(async () => ({ room_id: '!new:example.org' })),
    getSafeUserId: () => ME,
    getStateEvent: vi.fn(async () => ({ invite: 101, users: { [ME]: 101, [BOB]: 100 } })),
    sendStateEvent: vi.fn(async () => ({ event_id: '$pl' })),
    getAccountData: vi.fn(() => undefined),
    setAccountData: vi.fn(async () => ({})),
  };
  return { mx, client: mx as unknown as MatrixClient };
};

type CreateOptions = {
  room_version?: string;
  preset: string;
  invite: string[];
  initial_state: { type: string }[];
  power_level_content_override?: {
    invite: number;
    kick?: number;
    ban?: number;
    events?: Record<string, number>;
  };
};
const created = (mx: ReturnType<typeof client>['mx']) =>
  mx.createRoom.mock.calls[0][0] as unknown as CreateOptions;

describe('createDirectChat', () => {
  it('on version 11 puts the invite level above what both people have', async () => {
    const { mx, client: c } = client();

    await createDirectChat(c, BOB, { version: '11' });

    const opts = created(mx);
    expect(opts.room_version).toBe('11');
    // the trusted private chat preset gives both people 100
    expect(opts.preset).toBe('trusted_private_chat');
    expect(INVITE_LOCKED_LEVEL).toBeGreaterThan(100);
    // the invite made at creation needs a creator at the lock level, who then steps down
    expect(opts.power_level_content_override).toEqual({
      invite: INVITE_LOCKED_LEVEL,
      users: { [ME]: INVITE_LOCKED_LEVEL, [BOB]: 100 },
    });
    expect(mx.sendStateEvent).toHaveBeenCalledWith('!new:example.org', 'm.room.power_levels', {
      invite: INVITE_LOCKED_LEVEL,
      users: { [ME]: 100, [BOB]: 100 },
    });
  });

  it('on version 12 lets the preset make both people creators', async () => {
    const { mx, client: c } = client();

    await createDirectChat(c, BOB, { version: '12' });

    const opts = created(mx);
    expect(opts.room_version).toBe('12');
    expect(opts.preset).toBe('trusted_private_chat');
    expect(opts.power_level_content_override).toBeUndefined();
    expect(mx.sendStateEvent).not.toHaveBeenCalled();
  });

  it('is version 12 and encrypted unless asked otherwise, and listed under the person', async () => {
    const { mx, client: c } = client();

    await createDirectChat(c, BOB);
    expect(created(mx).room_version).toBe('12');
    expect(created(mx).initial_state.map((e) => e.type)).toEqual(['m.room.encryption']);
    expect(mx.setAccountData).toHaveBeenCalledWith('m.direct', {
      [BOB]: ['!new:example.org'],
    });

    const plain = client();
    await createDirectChat(plain.client, BOB, { encrypted: false });
    expect(created(plain.mx).initial_state).toEqual([]);
  });
});

describe('createDirectGroup', () => {
  it('lets everyone invite and join calls, and only the creator kick and ban', async () => {
    const { mx, client: c } = client();

    await createDirectGroup(c, [BOB, CAROL], BOB);

    const opts = created(mx);
    // plain members: the trusted preset would make the invited creators
    expect(opts.preset).toBe('private_chat');
    expect(opts.invite).toEqual([BOB, CAROL]);
    expect(opts.power_level_content_override).toMatchObject({
      invite: 0,
      kick: 100,
      ban: 100,
      events: { 'org.matrix.msc3401.call.member': 0 },
    });
    expect(mx.setAccountData).toHaveBeenCalledWith('m.direct', {
      [BOB]: ['!new:example.org'],
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  mergePowerLevels,
  planSpacePermissionSync,
  SyncContext,
  SyncRoomState,
} from '../../src/app/features/space-settings/permissions/spacePermissionSync';

const ME = '@me:example.org';
const OTHER = '@other:example.org';

const basePowers = {
  ban: 50,
  kick: 50,
  events_default: 0,
  state_default: 50,
  users_default: 0,
  users: { [ME]: 100 },
  events: { 'm.room.power_levels': 100, 'in.cinny.room.power_level_tags': 100 },
};

const room = (overrides: Partial<SyncRoomState> = {}): SyncRoomState => ({
  powerLevels: basePowers,
  tags: {},
  creators: new Set(),
  children: [],
  ...overrides,
});

const spaceTags = { 50: { name: 'Mod', color: '#2ecc71' } };

const ctxWith = (rooms: Record<string, SyncRoomState>, spaceChildren: string[]): SyncContext => ({
  userId: ME,
  spaceId: '!space:example.org',
  space: {
    powerLevels: { ...basePowers, ban: 100, users: { [OTHER]: 100 } },
    tags: spaceTags,
    children: spaceChildren,
  },
  lookup: (id) => rooms[id],
});

describe('mergePowerLevels', () => {
  it('takes the space policy but keeps the room own member levels', () => {
    const merged = mergePowerLevels(
      { ban: 50, users: { [ME]: 100, [OTHER]: 0 } },
      { ban: 100, kick: 50, users: { [OTHER]: 100 } }
    );
    expect(merged).toEqual({ ban: 100, kick: 50, users: { [ME]: 100, [OTHER]: 0 } });
  });

  it('removes keys the space does not define', () => {
    const merged = mergePowerLevels({ invite: 0, kick: 50 }, { kick: 100 });
    expect(merged).toEqual({ kick: 100 });
  });
});

describe('planSpacePermissionSync', () => {
  it('updates a joined room whose powers or tags differ', () => {
    const plan = planSpacePermissionSync(ctxWith({ '!a:x': room() }, ['!a:x']));
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].roomId).toBe('!a:x');
    expect(plan.updates[0].powerLevels?.ban).toBe(100);
    expect(plan.updates[0].tags).toEqual(spaceTags);
    expect(plan.skipped).toEqual([]);
  });

  it('skips a room that is not joined', () => {
    const plan = planSpacePermissionSync(ctxWith({}, ['!gone:x']));
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([{ roomId: '!gone:x', reason: 'not-joined' }]);
  });

  it('skips a room the user cannot edit before any change', () => {
    const rooms = {
      '!locked:x': room({
        powerLevels: { ...basePowers, users: { [ME]: 0 } },
      }),
    };
    const plan = planSpacePermissionSync(ctxWith(rooms, ['!locked:x']));
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([{ roomId: '!locked:x', reason: 'no-permission' }]);
  });

  it('skips a room where the merged policy would remove the users own access', () => {
    // The space requires power 101 to edit power levels, above the user's 100.
    const ctx = ctxWith({ '!a:x': room() }, ['!a:x']);
    ctx.space.powerLevels = {
      ...basePowers,
      events: { 'm.room.power_levels': 101, 'in.cinny.room.power_level_tags': 100 },
    };
    const plan = planSpacePermissionSync(ctx);
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([{ roomId: '!a:x', reason: 'would-lose-access' }]);
  });

  it('skips a room that already matches the space', () => {
    const rooms = {
      '!same:x': room({
        powerLevels: mergePowerLevels(basePowers, {
          ...basePowers,
          ban: 100,
          users: { [OTHER]: 100 },
        }),
        tags: spaceTags,
      }),
    };
    const plan = planSpacePermissionSync(ctxWith(rooms, ['!same:x']));
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([{ roomId: '!same:x', reason: 'unchanged' }]);
  });

  it('treats key order as irrelevant when comparing tags', () => {
    const rooms = {
      '!order:x': room({
        powerLevels: mergePowerLevels(basePowers, {
          ...basePowers,
          ban: 100,
          users: { [OTHER]: 100 },
        }),
        tags: { 50: { color: '#2ecc71', name: 'Mod' } },
      }),
    };
    const plan = planSpacePermissionSync(ctxWith(rooms, ['!order:x']));
    expect(plan.skipped).toEqual([{ roomId: '!order:x', reason: 'unchanged' }]);
  });

  it('walks subspaces recursively and does not loop on a cycle', () => {
    const rooms: Record<string, SyncRoomState> = {
      '!sub:x': room({ children: ['!leaf:x', '!space:example.org'] }),
      '!leaf:x': room(),
    };
    const plan = planSpacePermissionSync(ctxWith(rooms, ['!sub:x']));
    const planned = [...plan.updates.map((u) => u.roomId), ...plan.skipped.map((s) => s.roomId)];
    expect(planned.sort()).toEqual(['!leaf:x', '!sub:x']);
  });

  it('plans each room once even when two parents list it', () => {
    const rooms = { '!shared:x': room() };
    const plan = planSpacePermissionSync(ctxWith(rooms, ['!shared:x', '!shared:x']));
    expect(plan.updates).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import { MatrixClient, Room } from 'matrix-js-sdk';
import {
  planNotificationDefaults,
  resolveSpaceNotificationMode,
  RoomNotificationState,
} from '../../src/app/utils/notificationDefaults';
import {
  RoomNotificationMode as Mode,
  withoutInheritedRules,
} from '../../src/app/hooks/useRoomsNotificationPreferences';

const room = (
  roomId: string,
  wanted: RoomNotificationState['wanted'],
  current: Mode
): RoomNotificationState => ({ roomId, wanted, current });

describe('planNotificationDefaults', () => {
  it('writes a mentions rule for unset rooms in a mentions space', () => {
    const plan = planNotificationDefaults([room('!a', 'mentions', Mode.Unset)], {});
    expect(plan).toEqual({
      changes: [{ roomId: '!a', previous: Mode.Unset, mode: Mode.SpecialMessages }],
      inherited: { '!a': Mode.SpecialMessages },
    });
  });

  it('mutes unset rooms in a space set to Nothing', () => {
    const plan = planNotificationDefaults([room('!a', 'nothing', Mode.Unset)], {});
    expect(plan.changes).toEqual([{ roomId: '!a', previous: Mode.Unset, mode: Mode.Mute }]);
    expect(plan.inherited).toEqual({ '!a': Mode.Mute });
  });

  it('does nothing while an inherited rule already matches', () => {
    const plan = planNotificationDefaults([room('!a', 'mentions', Mode.SpecialMessages)], {
      '!a': Mode.SpecialMessages,
    });
    expect(plan).toEqual({ changes: [], inherited: { '!a': Mode.SpecialMessages } });
  });

  it('replaces an inherited rule when the space asks for a different mode', () => {
    const plan = planNotificationDefaults([room('!a', 'nothing', Mode.SpecialMessages)], {
      '!a': Mode.SpecialMessages,
    });
    expect(plan.changes).toEqual([
      { roomId: '!a', previous: Mode.SpecialMessages, mode: Mode.Mute },
    ]);
    expect(plan.inherited).toEqual({ '!a': Mode.Mute });
  });

  it('removes an inherited rule once the space asks for all messages', () => {
    const plan = planNotificationDefaults([room('!a', 'all', Mode.Mute)], { '!a': Mode.Mute });
    expect(plan).toEqual({
      changes: [{ roomId: '!a', previous: Mode.Mute, mode: Mode.Unset }],
      inherited: {},
    });
  });

  it('never touches rules the user set themselves', () => {
    const rooms = [
      room('!own-mentions', 'nothing', Mode.SpecialMessages),
      room('!own-all', 'mentions', Mode.AllMessages),
      room('!muted', 'mentions', Mode.Mute),
      room('!own-mentions-all-space', 'all', Mode.SpecialMessages),
    ];
    expect(planNotificationDefaults(rooms, {})).toEqual({ changes: [], inherited: {} });
  });

  it('treats a rule that differs from the one we wrote as the user own', () => {
    const plan = planNotificationDefaults([room('!a', 'all', Mode.Mute)], {
      '!a': Mode.SpecialMessages,
    });
    expect(plan).toEqual({ changes: [], inherited: {} });
  });

  it('follows the space again when the user resets a room to Default', () => {
    const plan = planNotificationDefaults([room('!a', 'mentions', Mode.Unset)], {
      '!a': Mode.SpecialMessages,
    });
    expect(plan.changes).toEqual([
      { roomId: '!a', previous: Mode.Unset, mode: Mode.SpecialMessages },
    ]);
  });

  it('forgets rooms that are no longer joined', () => {
    expect(planNotificationDefaults([], { '!gone': Mode.Mute }).inherited).toEqual({});
  });

  it('leaves rooms outside any restricting space alone', () => {
    expect(planNotificationDefaults([room('!dm', 'all', Mode.Unset)], {})).toEqual({
      changes: [],
      inherited: {},
    });
  });
});

// A space is a stub room whose state holds the owner's default, if any.
const fakeSpace = (roomId: string, ownerMode?: 'all' | 'mentions') =>
  ({
    roomId,
    getLiveTimeline: () => ({
      getState: () => ({
        getStateEvents: () => (ownerMode ? { getContent: () => ({ mode: ownerMode }) } : undefined),
      }),
    }),
  }) as unknown as Room;

const fakeClient = (spaces: Room[]) =>
  ({
    getRoom: (id: string) => spaces.find((space) => space.roomId === id),
  }) as unknown as MatrixClient;

describe('resolveSpaceNotificationMode', () => {
  const parents = new Map([
    ['!sub', new Set(['!top'])],
    ['!other', new Set(['!top'])],
  ]);

  it('uses the owner default of the space itself', () => {
    const mx = fakeClient([fakeSpace('!top', 'mentions')]);
    expect(resolveSpaceNotificationMode(mx, parents, new Map(), '!top')).toBe('mentions');
  });

  it('lets a subspace without a setting follow its parent space', () => {
    const mx = fakeClient([fakeSpace('!top', 'mentions'), fakeSpace('!sub')]);
    expect(resolveSpaceNotificationMode(mx, parents, new Map(), '!sub')).toBe('mentions');
  });

  it('lets a subspace with its own default override the parent', () => {
    const mx = fakeClient([fakeSpace('!top', 'mentions'), fakeSpace('!sub', 'all')]);
    expect(resolveSpaceNotificationMode(mx, parents, new Map(), '!sub')).toBe('all');
  });

  it('prefers the member own choice over the owner default, also through a parent', () => {
    const mx = fakeClient([fakeSpace('!top', 'mentions'), fakeSpace('!sub')]);
    expect(resolveSpaceNotificationMode(mx, parents, new Map([['!sub', 'nothing']]), '!sub')).toBe(
      'nothing'
    );
    expect(resolveSpaceNotificationMode(mx, parents, new Map([['!top', 'nothing']]), '!sub')).toBe(
      'nothing'
    );
  });

  it('notifies for all messages when nothing is set anywhere', () => {
    const mx = fakeClient([fakeSpace('!top'), fakeSpace('!sub')]);
    expect(resolveSpaceNotificationMode(mx, parents, new Map(), '!sub')).toBe('all');
  });

  it('uses the quietest parent when a space has several', () => {
    const several = new Map([['!sub', new Set(['!a', '!b'])]]);
    const mx = fakeClient([fakeSpace('!a', 'mentions'), fakeSpace('!b'), fakeSpace('!sub')]);
    expect(resolveSpaceNotificationMode(mx, several, new Map(), '!sub')).toBe('mentions');
  });

  it('survives a space cycle', () => {
    const cycle = new Map([
      ['!a', new Set(['!b'])],
      ['!b', new Set(['!a'])],
    ]);
    const mx = fakeClient([fakeSpace('!a'), fakeSpace('!b')]);
    expect(resolveSpaceNotificationMode(mx, cycle, new Map(), '!a')).toBe('all');
  });
});

describe('withoutInheritedRules', () => {
  const prefs = {
    mute: new Set(['!muted-by-space', '!muted-by-me']),
    specialMessages: new Set(['!mentions-by-space', '!mentions-by-me']),
    allMessages: new Set(['!all']),
  };

  it('hides rules the space wrote and keeps the user own', () => {
    const own = withoutInheritedRules(prefs, {
      '!muted-by-space': Mode.Mute,
      '!mentions-by-space': Mode.SpecialMessages,
    });
    expect([...own.mute]).toEqual(['!muted-by-me']);
    expect([...own.specialMessages]).toEqual(['!mentions-by-me']);
    expect([...own.allMessages]).toEqual(['!all']);
  });

  it('keeps a rule the user changed after the space wrote one', () => {
    const own = withoutInheritedRules(prefs, { '!muted-by-me': Mode.SpecialMessages });
    expect(own.mute.has('!muted-by-me')).toBe(true);
  });
});

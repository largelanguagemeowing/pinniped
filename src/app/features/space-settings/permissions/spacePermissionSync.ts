import { MatrixClient, Room } from 'matrix-js-sdk';
import { IPowerLevels } from '../../../hooks/usePowerLevels';
import { getRoomPermissionsAPI } from '../../../hooks/useRoomPermissions';
import { getRoomCreatorsForRoomId } from '../../../hooks/useRoomCreators';
import { StateEvent } from '../../../../types/matrix/room';
import { getSpaceChildren, getStateEvent } from '../../../utils/room';

/** Power level content as stored in `m.room.power_levels`. */
export type PowerLevelsContent = Record<string, unknown>;
/** Role tag content as stored in `in.cinny.room.power_level_tags`. */
export type PowerTagsContent = Record<string, unknown>;

/**
 * The part of a room the sync needs. `undefined` from `lookup` means the room is not joined,
 * so its state cannot be read or changed from here.
 */
export type SyncRoomState = {
  powerLevels: PowerLevelsContent;
  tags: PowerTagsContent;
  creators: Set<string>;
  children: string[];
};

export type SyncContext = {
  userId: string;
  spaceId: string;
  space: { powerLevels: PowerLevelsContent; tags: PowerTagsContent; children: string[] };
  lookup: (roomId: string) => SyncRoomState | undefined;
};

export type SkipReason = 'not-joined' | 'no-permission' | 'would-lose-access' | 'unchanged';

export type SyncUpdate = {
  roomId: string;
  /** Set only when the room's power levels change. */
  powerLevels?: PowerLevelsContent;
  /** Set only when the room's role tags change. */
  tags?: PowerTagsContent;
};

export type SyncPlan = {
  updates: SyncUpdate[];
  skipped: { roomId: string; reason: SkipReason }[];
};

/**
 * Power levels keys that the sync leaves to each room. `users` holds individual members' levels,
 * which are room-specific roles, not a space policy.
 */
const ROOM_OWNED_KEYS = new Set(['users']);

/** The space's power levels, with this room's own member levels kept. */
export const mergePowerLevels = (
  child: PowerLevelsContent,
  space: PowerLevelsContent
): PowerLevelsContent => {
  const merged: PowerLevelsContent = {};
  Object.entries(space).forEach(([key, value]) => {
    if (!ROOM_OWNED_KEYS.has(key)) merged[key] = value;
  });
  if (child.users !== undefined) merged.users = child.users;
  return merged;
};

/** JSON with object keys sorted, so equal content compares equal whatever the key order. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, val: unknown) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1))
      );
    }
    return val;
  });

const canEditSettings = (
  creators: Set<string>,
  powerLevels: PowerLevelsContent,
  userId: string
): boolean => {
  const api = getRoomPermissionsAPI(creators, powerLevels as unknown as IPowerLevels);
  return (
    api.stateEvent(StateEvent.RoomPowerLevels, userId) &&
    api.stateEvent(StateEvent.PowerLevelTags, userId)
  );
};

/**
 * Plans the sync of the space's power levels and role tags to every joined room below it,
 * including subspaces and their rooms. Nothing is sent here; this only decides what to change.
 */
export const planSpacePermissionSync = (ctx: SyncContext): SyncPlan => {
  const plan: SyncPlan = { updates: [], skipped: [] };
  const visited = new Set<string>([ctx.spaceId]);
  const queue = [...ctx.space.children];

  while (queue.length > 0) {
    const roomId = queue.shift()!;
    if (!visited.has(roomId)) {
      visited.add(roomId);
      const room = ctx.lookup(roomId);
      if (!room) {
        plan.skipped.push({ roomId, reason: 'not-joined' });
      } else {
        planRoom(ctx, roomId, room, plan);
        queue.push(...room.children);
      }
    }
  }

  return plan;
};

const planRoom = (ctx: SyncContext, roomId: string, room: SyncRoomState, plan: SyncPlan) => {
  if (!canEditSettings(room.creators, room.powerLevels, ctx.userId)) {
    plan.skipped.push({ roomId, reason: 'no-permission' });
    return;
  }

  const powerLevels = mergePowerLevels(room.powerLevels, ctx.space.powerLevels);
  if (!canEditSettings(room.creators, powerLevels, ctx.userId)) {
    plan.skipped.push({ roomId, reason: 'would-lose-access' });
    return;
  }

  const update: SyncUpdate = { roomId };
  if (canonical(powerLevels) !== canonical(room.powerLevels)) update.powerLevels = powerLevels;
  if (canonical(ctx.space.tags) !== canonical(room.tags)) update.tags = ctx.space.tags;

  if (update.powerLevels === undefined && update.tags === undefined) {
    plan.skipped.push({ roomId, reason: 'unchanged' });
    return;
  }
  plan.updates.push(update);
};

/** Reads the sync context from a Matrix client, using the space as the source of truth. */
export const readSyncContext = (mx: MatrixClient, space: Room): SyncContext => {
  const readContent = (room: Room, type: string): Record<string, unknown> =>
    (getStateEvent(room, type as StateEvent)?.getContent() as Record<string, unknown>) ?? {};

  const lookup = (roomId: string): SyncRoomState | undefined => {
    const room = mx.getRoom(roomId);
    if (!room || room.getMyMembership() !== 'join') return undefined;
    return {
      powerLevels: readContent(room, StateEvent.RoomPowerLevels),
      tags: readContent(room, StateEvent.PowerLevelTags),
      creators: getRoomCreatorsForRoomId(mx, roomId),
      children: getSpaceChildren(room),
    };
  };

  return {
    userId: mx.getSafeUserId(),
    spaceId: space.roomId,
    space: {
      powerLevels: readContent(space, StateEvent.RoomPowerLevels),
      tags: readContent(space, StateEvent.PowerLevelTags),
      children: getSpaceChildren(space),
    },
    lookup,
  };
};

export type SyncResult = {
  updated: number;
  failed: { roomId: string; error: string }[];
};

/**
 * Sends the planned changes one room at a time. A failed room is recorded and the rest still
 * run, so one restricted room does not stop the others.
 */
export const applySpacePermissionSync = async (
  mx: MatrixClient,
  updates: SyncUpdate[]
): Promise<SyncResult> => {
  const result: SyncResult = { updated: 0, failed: [] };
  for (const update of updates) {
    try {
      if (update.powerLevels !== undefined) {
        await mx.sendStateEvent(
          update.roomId,
          StateEvent.RoomPowerLevels as any,
          update.powerLevels
        );
      }
      if (update.tags !== undefined) {
        await mx.sendStateEvent(update.roomId, StateEvent.PowerLevelTags as any, update.tags);
      }
      result.updated += 1;
    } catch (e) {
      result.failed.push({
        roomId: update.roomId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return result;
};

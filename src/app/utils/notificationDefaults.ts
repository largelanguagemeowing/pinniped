import { EventType, IPushRules, MatrixClient, Room } from 'matrix-js-sdk';
import { AccountDataEvent } from '../../types/matrix/accountData';
import {
  Membership,
  RoomToParents,
  SpaceNotificationDefault,
  SpaceNotificationDefaultContent,
  SpaceNotificationMode,
  StateEvent,
} from '../../types/matrix/room';
import {
  getRoomNotificationMode,
  getRoomsNotificationPreferences,
  RoomNotificationMode,
  setRoomNotificationPreference,
} from '../hooks/useRoomsNotificationPreferences';
import { getRoomToParents, getStateEvent } from './room';
import { rateLimitedActions } from './matrix';
import {
  getInheritedNotifications,
  InheritedNotifications,
  setInheritedNotifications,
} from './inheritedNotifications';

/**
 * Space-wide notification modes.
 *
 * What a room notifies for, when the member has not chosen for the room itself,
 * comes from its space: the member's own choice for the space
 * (`PinnipedSpaceNotifications` account data), else the space owner's default
 * (`SpaceNotificationDefault` state event). A space with neither follows its
 * parent space, so subspaces inherit; the top of the chain notifies for all
 * messages.
 *
 * Push rules are per-user and evaluated by the homeserver, so the client applies
 * a space's mode by writing ordinary room push rules and remembers the ones it
 * wrote in `PinnipedInheritedNotifications` account data. A rule in that record
 * follows the space; any other rule is the user's own and is never touched.
 */

/** The room push rule that stands for each space mode. */
const MODE_TO_ROOM_MODE: Record<SpaceNotificationMode, RoomNotificationMode> = {
  all: RoomNotificationMode.Unset,
  mentions: RoomNotificationMode.SpecialMessages,
  nothing: RoomNotificationMode.Mute,
};

/** Louder modes have a higher rank; with several spaces the quietest wins. */
const MODE_RANK: Record<SpaceNotificationMode, number> = { nothing: 0, mentions: 1, all: 2 };

/** What the owner set for the space, if they set anything. */
const getOwnerDefault = (space: Room): SpaceNotificationDefault | undefined => {
  const mode = getStateEvent(
    space,
    StateEvent.SpaceNotificationDefault
  )?.getContent<SpaceNotificationDefaultContent>().mode;
  return mode === 'all' || mode === 'mentions' ? mode : undefined;
};

export const getSpaceNotificationDefault = (space: Room): SpaceNotificationDefault =>
  getOwnerDefault(space) ?? 'all';

const isSpaceNotificationMode = (value: unknown): value is SpaceNotificationMode =>
  typeof value === 'string' && value in MODE_RANK;

/** The member's own choice per space; a space without an entry follows its default. */
export const getSpaceNotificationModes = (mx: MatrixClient): Map<string, SpaceNotificationMode> => {
  const spaces = mx
    .getAccountData(AccountDataEvent.PinnipedSpaceNotifications)
    ?.getContent().spaces;
  return new Map(
    Object.entries(spaces ?? {}).filter((entry): entry is [string, SpaceNotificationMode] =>
      isSpaceNotificationMode(entry[1])
    )
  );
};

export const setSpaceNotificationMode = (
  mx: MatrixClient,
  spaceId: string,
  mode: SpaceNotificationMode | undefined
): Promise<unknown> => {
  const spaces = Object.fromEntries(getSpaceNotificationModes(mx));
  if (mode) spaces[spaceId] = mode;
  else delete spaces[spaceId];
  return mx.setAccountData(AccountDataEvent.PinnipedSpaceNotifications, { spaces });
};

const quietest = (modes: SpaceNotificationMode[]): SpaceNotificationMode =>
  modes.reduce((a, b) => (MODE_RANK[b] < MODE_RANK[a] ? b : a), 'all');

/**
 * What a space asks of this member's rooms: their own choice, else the owner's
 * default, else what its parent spaces ask (the quietest, if there are several).
 */
export const resolveSpaceNotificationMode = (
  mx: MatrixClient,
  roomToParents: RoomToParents,
  chosen: ReadonlyMap<string, SpaceNotificationMode>,
  spaceId: string,
  visited: ReadonlySet<string> = new Set()
): SpaceNotificationMode => {
  const space = mx.getRoom(spaceId);
  const own = chosen.get(spaceId) ?? (space && getOwnerDefault(space));
  if (own) return own;

  const seen = new Set(visited).add(spaceId);
  return quietest(
    Array.from(roomToParents.get(spaceId) ?? [])
      .filter((parentId) => !seen.has(parentId))
      .map((parentId) => resolveSpaceNotificationMode(mx, roomToParents, chosen, parentId, seen))
  );
};

export type RoomNotificationState = {
  roomId: string;
  /** What the room's spaces ask for. */
  wanted: SpaceNotificationMode;
  current: RoomNotificationMode;
};

export type NotificationDefaultsPlan = {
  changes: { roomId: string; previous: RoomNotificationMode; mode: RoomNotificationMode }[];
  /** The rooms that follow a space once the changes are carried out. */
  inherited: InheritedNotifications;
};

/**
 * Decides which room push rules to change. A room is the space's to set while it
 * has no rule or still has the one we wrote; any other rule is the user's choice
 * (picking a mode on the room replaces ours), and "Default" hands it back.
 */
export const planNotificationDefaults = (
  rooms: RoomNotificationState[],
  inherited: Readonly<InheritedNotifications>
): NotificationDefaultsPlan => {
  const plan: NotificationDefaultsPlan = { changes: [], inherited: {} };

  rooms.forEach(({ roomId, wanted, current }) => {
    const target = MODE_TO_ROOM_MODE[wanted];
    const spaceOwns = current === RoomNotificationMode.Unset || current === inherited[roomId];
    if (!spaceOwns) return;

    if (target !== current) plan.changes.push({ roomId, previous: current, mode: target });
    if (target === RoomNotificationMode.SpecialMessages || target === RoomNotificationMode.Mute) {
      plan.inherited[roomId] = target;
    }
  });

  return plan;
};

const getWantedMode = (
  mx: MatrixClient,
  roomToParents: RoomToParents,
  chosen: ReadonlyMap<string, SpaceNotificationMode>,
  roomId: string
): SpaceNotificationMode =>
  quietest(
    Array.from(roomToParents.get(roomId) ?? []).map((spaceId) =>
      resolveSpaceNotificationMode(mx, roomToParents, chosen, spaceId)
    )
  );

const sameRecord = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
};

const reconcileNow = async (mx: MatrixClient): Promise<void> => {
  const pushRules = mx.getAccountData(EventType.PushRules)?.getContent<IPushRules>();
  // Without the user's push rules every room looks unset and we would write over them.
  if (!pushRules || !mx.isInitialSyncComplete()) return;

  const preferences = getRoomsNotificationPreferences(pushRules);
  const roomToParents = getRoomToParents(mx);
  const chosen = getSpaceNotificationModes(mx);
  const rooms: RoomNotificationState[] = mx
    .getRooms()
    .filter((room) => room.getMyMembership() === Membership.Join && !room.isSpaceRoom())
    .map((room) => ({
      roomId: room.roomId,
      wanted: getWantedMode(mx, roomToParents, chosen, room.roomId),
      current: getRoomNotificationMode(preferences, room.roomId),
    }));

  const inherited = getInheritedNotifications(mx);
  const plan = planNotificationDefaults(rooms, inherited);
  if (plan.changes.length === 0 && sameRecord(inherited, plan.inherited)) return;

  // Record the rooms first: if a rule write fails, the room is still marked as
  // following and the next run retries it, instead of the rule looking like the
  // user's own choice. Rules are written one at a time because they share an
  // account data event.
  await setInheritedNotifications(mx, plan.inherited);
  await rateLimitedActions(plan.changes, ({ roomId, previous, mode }) =>
    setRoomNotificationPreference(mx, roomId, mode, previous)
  );
};

// Runs are serialised and each reads fresh state, so overlapping triggers (every
// rule we write echoes back through sync) settle into no-ops.
let queue: Promise<unknown> = Promise.resolve();

export const reconcileNotificationDefaults = (mx: MatrixClient): Promise<unknown> => {
  queue = queue.catch(() => undefined).then(() => reconcileNow(mx));
  return queue;
};

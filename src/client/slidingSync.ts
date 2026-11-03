import { EventType, MatrixClient } from 'matrix-js-sdk';
import {
  MSC3575List,
  MSC3575RoomSubscription,
  SlidingSync,
  SlidingSyncEvent,
  SlidingSyncState,
  MSC3575_STATE_KEY_LAZY,
  MSC3575_STATE_KEY_ME,
} from 'matrix-js-sdk/lib/sliding-sync';

/**
 * Simplified sliding sync (MSC4186). Used instead of classic /sync when the homeserver advertises it,
 * because classic /sync makes the client hold every joined room, which does not scale to thousands.
 *
 * Shape (the same pattern other clients use):
 *  - a few lists whose windows grow in batches until they cover the list ("spidering"),
 *  - a room subscription, with a deeper timeline, for rooms the user is looking at,
 *  - minimal required_state with lazy-loaded members.
 */
export const SLIDING_SYNC_FEATURE = 'org.matrix.simplified_msc3575';
const SYNC_TIMEOUT_MS = 30000;
const SPIDER_BATCH = 50;
const SPIDER_DELAY_MS = 250;
const SPACE_SUBSCRIPTION = 'space';
const OPT_OUT_KEY = 'pinniped.slidingSync'; // set to "off" to force classic /sync

const ROOM_STATE: string[][] = [
  [EventType.RoomCreate, ''],
  [EventType.RoomName, ''],
  [EventType.RoomAvatar, ''],
  [EventType.RoomTopic, ''],
  [EventType.RoomCanonicalAlias, ''],
  [EventType.RoomJoinRules, ''],
  [EventType.RoomPowerLevels, ''],
  [EventType.RoomEncryption, ''],
  [EventType.RoomTombstone, ''],
  [EventType.SpaceParent, '*'],
  [EventType.RoomMember, MSC3575_STATE_KEY_ME],
  [EventType.RoomMember, MSC3575_STATE_KEY_LAZY],
];

// Spaces are listed cheaply; their (potentially huge) child list is requested only when one is opened.
const SPACE_LIST_STATE: string[][] = ROOM_STATE.filter(([t]) => t !== EventType.SpaceParent);

type Spider = { key: string; max: number };

const instances = new WeakMap<MatrixClient, SlidingSync>();

export const getSlidingSync = (mx: MatrixClient): SlidingSync | undefined => instances.get(mx);

const serverSupportsSlidingSync = async (mx: MatrixClient): Promise<boolean> => {
  try {
    if (window.localStorage.getItem(OPT_OUT_KEY) === 'off') return false;
    const versions = await mx.getVersions();
    return versions.unstable_features?.[SLIDING_SYNC_FEATURE] === true;
  } catch {
    return false;
  }
};

/** Returns a configured SlidingSync, or undefined when the server only supports classic /sync. */
export const createSlidingSync = async (mx: MatrixClient): Promise<SlidingSync | undefined> => {
  if (!(await serverSupportsSlidingSync(mx))) return undefined;

  const lists = new Map<string, MSC3575List>([
    [
      'spaces',
      {
        ranges: [[0, SPIDER_BATCH - 1]],
        timeline_limit: 0,
        required_state: SPACE_LIST_STATE,
        filters: { room_types: ['m.space'] },
      },
    ],
    [
      'dms',
      {
        ranges: [[0, SPIDER_BATCH - 1]],
        timeline_limit: 1,
        required_state: ROOM_STATE,
        filters: { is_dm: true },
      },
    ],
    [
      'recent',
      {
        // Home view: the most recently active non-space rooms. Deliberately not spidered.
        ranges: [[0, SPIDER_BATCH - 1]],
        timeline_limit: 1,
        required_state: ROOM_STATE,
        filters: { is_dm: false, not_room_types: ['m.space'] },
      },
    ],
  ]);
  const defaultSubscription: MSC3575RoomSubscription = {
    required_state: ROOM_STATE,
    timeline_limit: 20,
  };
  const ss = new SlidingSync(mx.baseUrl, lists, defaultSubscription, mx, SYNC_TIMEOUT_MS);
  ss.addCustomSubscription(SPACE_SUBSCRIPTION, {
    required_state: [...ROOM_STATE, [EventType.SpaceChild, '*']],
    timeline_limit: 0,
  });

  // Spidering: after each response, widen fully-listed windows by one batch until they cover the list.
  const spiders: Spider[] = [
    { key: 'spaces', max: Infinity },
    { key: 'dms', max: Infinity },
  ];
  let timer: ReturnType<typeof setTimeout> | undefined;
  ss.on(SlidingSyncEvent.Lifecycle, (state: SlidingSyncState, resp) => {
    if (state !== SlidingSyncState.Complete || !resp || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      spiders.forEach(({ key, max }) => {
        const count = ss.getListData(key)?.joinedCount ?? 0;
        const end = ss.getListParams(key)?.ranges?.[0]?.[1] ?? -1;
        const target = Math.min(count, max) - 1;
        if (end < target) ss.setListRanges(key, [[0, Math.min(end + SPIDER_BATCH, target)]]);
      });
    }, SPIDER_DELAY_MS);
  });

  instances.set(mx, ss);
  return ss;
};

/**
 * Subscribes the rooms the user is looking at: the open space (with its children list), the children
 * to show in it, and the open room. Replaces the previous set; unlisted rooms stay in list windows only.
 */
export const subscribeVisibleRooms = (
  mx: MatrixClient,
  spaceId: string | undefined,
  roomId: string | undefined
): void => {
  const ss = instances.get(mx);
  if (!ss) return;
  const wanted = new Set<string>();
  if (spaceId) {
    wanted.add(spaceId);
    ss.useCustomSubscription(spaceId, SPACE_SUBSCRIPTION);
    mx.getRoom(spaceId)
      ?.currentState.getStateEvents(EventType.SpaceChild)
      .forEach((ev) => {
        const child = ev.getStateKey();
        const via = ev.getContent().via;
        if (child && Array.isArray(via) && via.length > 0) wanted.add(child);
      });
  }
  if (roomId) wanted.add(roomId);
  const current = ss.getRoomSubscriptions();
  const same = current.size === wanted.size && [...wanted].every((r) => current.has(r));
  if (!same) ss.modifyRoomSubscriptions(wanted);
};

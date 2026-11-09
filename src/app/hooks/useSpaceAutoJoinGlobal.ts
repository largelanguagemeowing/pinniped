import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { RoomEvent } from 'matrix-js-sdk';
import { useAtomValue } from 'jotai';
import { useMatrixClient } from './useMatrixClient';
import { useForceUpdate } from './useForceUpdate';
import { useStateEventCallback } from './useStateEventCallback';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import { allRoomsAtom } from '../state/room-list/roomList';
import { spaceRoomsAtom } from '../state/spaceRooms';
import { useOrphanSpaces, useSpaces } from '../state/hooks/roomList';
import { useSidebarItems } from './useSidebarItems';
import { roomToParentsAtom } from '../state/room/roomToParents';
import { Membership, MSpaceChildContent, StateEvent } from '../../types/matrix/room';
import { getStateEvent, getStateEvents, isValidChild } from '../utils/room';
import { getSpaceAutoJoin } from '../utils/spaceAutoJoin';
import { markRoomsLeft, unmarkRoomsLeft, useLeftRooms } from '../state/leftRooms';
import { isRoomId, rateLimitedActions } from '../utils/matrix';

type RoomToJoin = {
  roomId: string;
  via: string[];
};

/**
 * Globally auto-joins the child rooms (and subspaces) of every space that has
 * auto-join enabled, whether via the per-space `club.stablecat.pinniped.space.auto_join`
 * state event or the user-wide "Auto Join Space Rooms" setting.
 *
 * Unlike the old lobby-only hook, this runs as soon as the auto-join data is
 * received from the server, without the user having to open the space lobby.
 *
 * Runs reactively: it re-scans whenever the relevant state changes, including
 * when a `SpaceAutoJoin` or `m.space.child` event arrives, when a room is
 * joined (so newly-joined subspaces are recursed into), or when the sidebar
 * pin list changes.
 *
 * Subspaces are joined too, unless they are pinned to the sidebar. Pinned
 * subspaces are skipped entirely (neither joined nor recursed into), leaving
 * them for the user to manage manually. Joining a subspace enables discovery
 * of its own children, which are picked up on the next scan.
 *
 * Already-attempted rooms are tracked for the lifetime of the hook so we don't
 * hammer the homeserver with duplicate join requests. Rooms that fail to join
 * (e.g. invite-only) stay attempted and can still be joined manually from the
 * lobby.
 */
export const useSpaceAutoJoinGlobal = () => {
  const mx = useMatrixClient();
  const [autoJoinSpaceRooms] = useSetting(settingsAtom, 'autoJoinSpaceRooms');
  const [ignoreSpaceAutoJoin] = useSetting(settingsAtom, 'ignoreSpaceAutoJoin');
  const spaces = useSpaces(mx, allRoomsAtom);
  const spaceRooms = useAtomValue(spaceRoomsAtom);
  const roomToParents = useAtomValue(roomToParentsAtom);
  const orphanSpaces = useOrphanSpaces(mx, allRoomsAtom, roomToParents);
  const [sidebarItems] = useSidebarItems(orphanSpaces);
  const leftRooms = useLeftRooms();
  const attemptedRef = useRef<Set<string>>(new Set());
  const [updateCount, forceUpdate] = useForceUpdate();

  const leftRoomsRef = useRef(leftRooms);
  useLayoutEffect(() => {
    leftRoomsRef.current = leftRooms;
  }, [leftRooms]);

  // Remember every leave, not only the ones made through our own prompts, so a
  // room left on another device, via a kick, or in a bulk action is never
  // auto-joined back; and forget the mark once the user deliberately rejoins.
  useEffect(() => {
    const handleMembership = (room: { roomId: string }, membership: string, prev?: string) => {
      const isMarked = leftRoomsRef.current.has(room.roomId);
      if (
        prev === Membership.Join &&
        (membership === Membership.Leave || membership === Membership.Ban) &&
        !isMarked
      ) {
        markRoomsLeft(mx, [room.roomId]).catch(() => undefined);
      } else if (membership === Membership.Join && prev !== Membership.Join && isMarked) {
        unmarkRoomsLeft(mx, [room.roomId]).catch(() => undefined);
      }
    };
    mx.on(RoomEvent.MyMembership, handleMembership);
    return () => {
      mx.removeListener(RoomEvent.MyMembership, handleMembership);
    };
  }, [mx]);

  // Re-scan when SpaceAutoJoin or m.space.child events arrive.
  useStateEventCallback(
    mx,
    useCallback(
      (event) => {
        const type = event.getType();
        if (
          type === StateEvent.SpaceAutoJoin ||
          type === StateEvent.LegacySpaceAutoJoin ||
          type === StateEvent.SpaceChild
        ) {
          forceUpdate();
        }
      },
      [forceUpdate]
    )
  );

  // Entry-point spaces whose children should be auto-joined: those with the
  // per-space auto-join event set, or all spaces when the user-wide setting
  // is on.
  const autoJoinSpaces = useMemo(() => {
    const set = new Set<string>();
    spaces.forEach((spaceId) => {
      const room = mx.getRoom(spaceId);
      if (!room) return;
      if (autoJoinSpaceRooms) set.add(spaceId);
      if (!ignoreSpaceAutoJoin && getSpaceAutoJoin(room)) set.add(spaceId);
    });
    return set;
    // updateCount triggers recompute when state events arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mx, spaces, autoJoinSpaceRooms, ignoreSpaceAutoJoin, updateCount]);

  // Carry the legacy `im.kibby` auto-join setting over to the current event
  // type, for spaces where we are allowed to write it.
  const migratedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const userId = mx.getUserId();
    if (!userId) return;
    spaces.forEach((spaceId) => {
      const room = mx.getRoom(spaceId);
      if (!room || migratedRef.current.has(spaceId)) return;
      const legacy = getStateEvent(room, StateEvent.LegacySpaceAutoJoin);
      if (!legacy || getStateEvent(room, StateEvent.SpaceAutoJoin)) return;
      if (!room.currentState.maySendStateEvent(StateEvent.SpaceAutoJoin, userId)) return;
      migratedRef.current.add(spaceId);
      mx.sendStateEvent(spaceId, StateEvent.SpaceAutoJoin as any, legacy.getContent() as any).catch(
        () => undefined
      );
    });
    // updateCount re-runs this when state events arrive
  }, [mx, spaces, updateCount]);

  // Spaces visible in the sidebar (pinned). Pinned subspaces are skipped so
  // the user can manage them manually.
  const pinnedSpaces = useMemo(() => {
    const set = new Set<string>();
    sidebarItems.forEach((item) => {
      if (typeof item === 'string') {
        set.add(item);
      } else {
        item.content.forEach((id) => set.add(id));
      }
    });
    return set;
  }, [sidebarItems]);

  useEffect(() => {
    if (autoJoinSpaces.size === 0) return;

    const roomsToJoin: RoomToJoin[] = [];
    const visited = new Set<string>();
    const attempted = attemptedRef.current;

    const collect = (spaceId: string) => {
      if (visited.has(spaceId)) return;
      visited.add(spaceId);

      const space = mx.getRoom(spaceId);
      if (!space) return;
      const childEvents = getStateEvents(space, StateEvent.SpaceChild);

      childEvents.forEach((childEvent) => {
        if (!isValidChild(childEvent)) return;
        const childId = childEvent.getStateKey();
        if (!childId || !isRoomId(childId)) return;

        const childRoom = mx.getRoom(childId);
        const joined = childRoom?.getMyMembership() === Membership.Join;
        const isSpace = childRoom?.isSpaceRoom() || spaceRooms.has(childId);

        // Never join back rooms the user explicitly left.
        if (!joined && leftRooms.has(childId)) return;

        if (isSpace) {
          // Skip pinned subspaces entirely: don't join them and don't recurse
          // into them, leaving them for the user to manage manually.
          if (pinnedSpaces.has(childId)) return;

          if (joined) {
            // Recurse into joined, non-pinned subspaces so their children
            // get joined too.
            collect(childId);
          } else if (!attempted.has(childId)) {
            const content = childEvent.getContent<MSpaceChildContent>();
            roomsToJoin.push({ roomId: childId, via: content.via });
            attempted.add(childId);
          }
          return;
        }

        // Regular room child.
        if (joined || attempted.has(childId)) return;
        const content = childEvent.getContent<MSpaceChildContent>();
        roomsToJoin.push({ roomId: childId, via: content.via });
        attempted.add(childId);
      });
    };

    autoJoinSpaces.forEach(collect);

    if (roomsToJoin.length === 0) return;

    rateLimitedActions(roomsToJoin, async (item) => {
      try {
        await mx.joinRoom(item.roomId, { viaServers: item.via });
      } catch {
        // Swallowed: rateLimitedActions only retries on 429.
        // The room stays in attemptedRef so we don't retry automatically.
        // Users can still join manually via the lobby Join button.
      }
    });
  }, [mx, autoJoinSpaces, spaceRooms, pinnedSpaces, leftRooms]);
};

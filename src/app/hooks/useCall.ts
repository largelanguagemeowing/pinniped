import { Room, RoomStateEvent } from 'matrix-js-sdk';
import {
  MatrixRTCSession,
  MatrixRTCSessionEvent,
  MatrixRTCSessionEventHandlerMap,
} from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { CallMembership } from 'matrix-js-sdk/lib/matrixrtc/CallMembership';
import { useEffect, useState } from 'react';
import { MatrixRTCSessionManagerEvents } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSessionManager';
import { useMatrixClient } from './useMatrixClient';
import { getSpaceChildren } from '../utils/room';
import { StateEvent } from '../../types/matrix/room';

/**
 * The client lazy-loads room members, but matrix-js-sdk drops the call membership of anyone
 * whose join it has not loaded ("not in the room"), so a freshly joined account would see a
 * call without the people already in it. Load the members of a room once it has call
 * memberships; the session recalculates when they arrive. Rooms without a call are left alone.
 */
const useLoadMembersForCall = (room: Room) => {
  useEffect(() => {
    const loadIfCall = () => {
      if (room.currentState.getStateEvents(StateEvent.GroupCallMemberPrefix).length === 0) return;
      room.loadMembersIfNeeded().catch(() => undefined);
    };
    loadIfCall();
    room.on(RoomStateEvent.Events, loadIfCall);
    return () => {
      room.off(RoomStateEvent.Events, loadIfCall);
    };
  }, [room]);
};

export const useCallSession = (room: Room): MatrixRTCSession => {
  const mx = useMatrixClient();
  useLoadMembersForCall(room);

  const [session, setSession] = useState(mx.matrixRTC.getRoomSession(room));

  useEffect(() => {
    const start = (roomId: string) => {
      if (roomId !== room.roomId) return;
      setSession(mx.matrixRTC.getRoomSession(room));
    };
    const end = (roomId: string) => {
      if (roomId !== room.roomId) return;
      setSession(mx.matrixRTC.getRoomSession(room));
    };
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionStarted, start);
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionEnded, end);
    return () => {
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionStarted, start);
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionEnded, end);
    };
  }, [mx, room]);

  return session;
};

export const useCallMembersChange = (
  session: MatrixRTCSession,
  callback: (members: CallMembership[]) => void
): void => {
  useEffect(() => {
    const handleMembershipsChange: MatrixRTCSessionEventHandlerMap[MatrixRTCSessionEvent.MembershipsChanged] =
      (oldestMembership, newMemberships) => {
        callback(newMemberships);
      };

    session.on(MatrixRTCSessionEvent.MembershipsChanged, handleMembershipsChange);
    return () => {
      session.removeListener(MatrixRTCSessionEvent.MembershipsChanged, handleMembershipsChange);
    };
  }, [session, callback]);
};

export const useCallMembers = (session: MatrixRTCSession): CallMembership[] => {
  const [memberships, setMemberships] = useState<CallMembership[]>(session.memberships);

  useCallMembersChange(session, setMemberships);

  return memberships;
};

export const useSpaceHasCall = (space: Room): boolean => {
  const mx = useMatrixClient();
  const [hasCall, setHasCall] = useState(false);

  useEffect(() => {
    const childRoomIds = getSpaceChildren(space);
    const hasLocalCall = () =>
      childRoomIds.some((roomId) => {
        const room = mx.getRoom(roomId);
        if (!room) return false;
        return mx.matrixRTC.getRoomSession(room).memberships.length > 0;
      });

    // MatrixRTC sessions are built from synced state for every joined room,
    // so no per-room /state download is needed.
    const check = () => setHasCall(hasLocalCall());

    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionStarted, check);
    mx.matrixRTC.on(MatrixRTCSessionManagerEvents.SessionEnded, check);

    check();

    return () => {
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionStarted, check);
      mx.matrixRTC.off(MatrixRTCSessionManagerEvents.SessionEnded, check);
    };
  }, [mx, space]);

  return hasCall;
};

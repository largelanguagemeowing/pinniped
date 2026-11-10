import { useCallback, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { Room } from 'matrix-js-sdk';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { SpaceNotificationMode, StateEvent } from '../../types/matrix/room';
import { useAccountData } from './useAccountData';
import { useMatrixClient } from './useMatrixClient';
import { useStateEvent } from './useStateEvent';
import { useAsyncCallback } from './useAsyncCallback';
import {
  getSpaceNotificationModes,
  resolveSpaceNotificationMode,
  setSpaceNotificationMode,
} from '../utils/notificationDefaults';
import { roomToParentsAtom } from '../state/room/roomToParents';

/** The member's own notification choice for a space, and what they get without one. */
export const useSpaceNotificationMode = (space: Room) => {
  const mx = useMatrixClient();
  const accountData = useAccountData(AccountDataEvent.PinnipedSpaceNotifications);
  useStateEvent(space, StateEvent.SpaceNotificationDefault);

  const chosen: SpaceNotificationMode | undefined = useMemo(
    () => getSpaceNotificationModes(mx).get(space.roomId),
    // the account data event is what changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mx, space.roomId, accountData]
  );
  // What the space gives without the member's own choice: the owner's default, or its parents'.
  const roomToParents = useAtomValue(roomToParentsAtom);
  const ownerDefault: SpaceNotificationMode = useMemo(() => {
    const others = getSpaceNotificationModes(mx);
    others.delete(space.roomId);
    return resolveSpaceNotificationMode(mx, roomToParents, others, space.roomId);
    // the account data event is what changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mx, roomToParents, space.roomId, accountData]);

  const [changeState, change] = useAsyncCallback(
    useCallback(
      (mode: SpaceNotificationMode | undefined) => setSpaceNotificationMode(mx, space.roomId, mode),
      [mx, space.roomId]
    )
  );

  return { chosen, ownerDefault, changeState, change };
};

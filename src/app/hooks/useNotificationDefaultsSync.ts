import { useCallback, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { RoomEvent } from 'matrix-js-sdk';
import { useMatrixClient } from './useMatrixClient';
import { useAccountData } from './useAccountData';
import { useStateEventCallback } from './useStateEventCallback';
import { useForceUpdate } from './useForceUpdate';
import { roomToParentsAtom } from '../state/room/roomToParents';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { StateEvent } from '../../types/matrix/room';
import { reconcileNotificationDefaults } from '../utils/notificationDefaults';

/**
 * Keeps this user's room push rules in line with the notification defaults of
 * their spaces, both the owners' defaults and their own choices (see `utils/notificationDefaults.ts`). Re-runs when a default or
 * a space's rooms change, when a room is joined or left, and when push rules
 * change; runs that find nothing to do are cheap.
 */
export const useNotificationDefaultsSync = () => {
  const mx = useMatrixClient();
  const pushRules = useAccountData(AccountDataEvent.PushRules);
  const spaceModes = useAccountData(AccountDataEvent.PinnipedSpaceNotifications);
  const roomToParents = useAtomValue(roomToParentsAtom);
  const [updateCount, forceUpdate] = useForceUpdate();

  useStateEventCallback(
    mx,
    useCallback(
      (event) => {
        if (event.getType() === StateEvent.SpaceNotificationDefault) forceUpdate();
      },
      [forceUpdate]
    )
  );

  useEffect(() => {
    mx.on(RoomEvent.MyMembership, forceUpdate);
    return () => {
      mx.removeListener(RoomEvent.MyMembership, forceUpdate);
    };
  }, [mx, forceUpdate]);

  useEffect(() => {
    reconcileNotificationDefaults(mx).catch(() => undefined);
  }, [mx, pushRules, spaceModes, roomToParents, updateCount]);
};

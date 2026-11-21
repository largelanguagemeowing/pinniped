import { useCallback } from 'react';
import { NavigateOptions, useNavigate } from 'react-router-dom';
import { useAtomCallback } from 'jotai/utils';
import { getCanonicalAliasOrRoomId } from '../utils/matrix';
import {
  getHomeRoomPath,
  getRoomsRoomPath,
  getSpacePath,
  getSpaceRoomPath,
} from '../pages/pathUtils';
import { useMatrixClient } from './useMatrixClient';
import { getOrphanParents, guessPerfectParent } from '../utils/room';
import { roomToParentsAtom } from '../state/room/roomToParents';
import { mDirectAtom } from '../state/mDirectList';
import { useRouteSelectedSpace } from './router/useSelectedSpace';
import { settingsAtom } from '../state/settings';
import { useSetting } from '../state/hooks/settings';

export const useRoomNavigate = () => {
  const navigate = useNavigate();
  const mx = useMatrixClient();
  // Read when navigating, not when rendered: callers navigate after awaiting a join or an
  // m.direct update, which a render's snapshot predates (an accepted DM invite opened as a room).
  const getRoomToParents = useAtomCallback(useCallback((get) => get(roomToParentsAtom), []));
  const getMDirects = useAtomCallback(useCallback((get) => get(mDirectAtom), []));
  const spaceSelectedId = useRouteSelectedSpace();
  const [developerTools] = useSetting(settingsAtom, 'developerTools');

  const navigateSpace = useCallback(
    (roomId: string) => {
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, roomId);
      navigate(getSpacePath(roomIdOrAlias));
    },
    [mx, navigate]
  );

  const navigateRoom = useCallback(
    (roomId: string, eventId?: string, opts?: NavigateOptions) => {
      const roomIdOrAlias = getCanonicalAliasOrRoomId(mx, roomId);
      const openSpaceTimeline = developerTools && spaceSelectedId === roomId;

      const orphanParents = openSpaceTimeline
        ? [roomId]
        : getOrphanParents(getRoomToParents(), roomId);
      if (orphanParents.length > 0) {
        let parentSpace: string;
        if (spaceSelectedId && orphanParents.includes(spaceSelectedId)) {
          parentSpace = spaceSelectedId;
        } else {
          parentSpace = guessPerfectParent(mx, roomId, orphanParents) ?? orphanParents[0];
        }

        const pSpaceIdOrAlias = getCanonicalAliasOrRoomId(mx, parentSpace);

        navigate(
          getSpaceRoomPath(pSpaceIdOrAlias, openSpaceTimeline ? roomId : roomIdOrAlias, eventId),
          opts
        );
        return;
      }

      // Direct messages open in the Home view; other rooms without a parent
      // space open in the Rooms pseudo-space.
      if (getMDirects().has(roomId)) {
        navigate(getHomeRoomPath(roomIdOrAlias, eventId), opts);
        return;
      }
      navigate(getRoomsRoomPath(roomIdOrAlias, eventId), opts);
    },
    [mx, navigate, spaceSelectedId, getRoomToParents, getMDirects, developerTools]
  );

  return {
    navigateSpace,
    navigateRoom,
  };
};

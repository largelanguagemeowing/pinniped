import { Room } from 'matrix-js-sdk';
import { useAtomValue } from 'jotai';
import { useCallback, useMemo, useState } from 'react';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { StateEvent } from '../../types/matrix/room';
import { getRoomSoundPack, getUserSoundPack, SoundPack } from '../plugins/sound-pack';
import { roomToParentsAtom } from '../state/room/roomToParents';
import { getAllParents } from '../utils/room';
import { useAccountDataCallback } from './useAccountDataCallback';
import { useMatrixClient } from './useMatrixClient';
import { useStateEventCallback } from './useStateEventCallback';
import { useForceUpdate } from './useForceUpdate';

export const useUserSoundPack = (): SoundPack => {
  const mx = useMatrixClient();
  const [pack, setPack] = useState(() => getUserSoundPack(mx));

  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === AccountDataEvent.PinnipedUserSounds) setPack(getUserSoundPack(mx));
      },
      [mx]
    )
  );

  return pack;
};

export const useRoomSoundPack = (room: Room): SoundPack => {
  const mx = useMatrixClient();
  const [updateCount, forceUpdate] = useForceUpdate();

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (
          mEvent.getRoomId() === room.roomId &&
          mEvent.getType() === StateEvent.PinnipedRoomSounds
        ) {
          forceUpdate();
        }
      },
      [room, forceUpdate]
    )
  );

  return useMemo(
    () => getRoomSoundPack(room),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room, updateCount]
  );
};

/** The packs usable in a call in this room: the user's own, then the room's and its spaces'. */
export const useCallSoundPacks = (room: Room): { user: SoundPack; rooms: SoundPack[] } => {
  const mx = useMatrixClient();
  const user = useUserSoundPack();
  const roomToParents = useAtomValue(roomToParentsAtom);
  const [version, setVersion] = useState(0);

  const roomIds = useMemo(
    () => [room.roomId, ...getAllParents(roomToParents, room.roomId)],
    [room.roomId, roomToParents]
  );

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        const roomId = mEvent.getRoomId();
        if (
          mEvent.getType() === StateEvent.PinnipedRoomSounds &&
          roomId &&
          roomIds.includes(roomId)
        ) {
          setVersion((v) => v + 1);
        }
      },
      [roomIds]
    )
  );

  const rooms = useMemo(
    () =>
      roomIds
        .map((id) => mx.getRoom(id))
        .filter((r): r is Room => !!r)
        .map(getRoomSoundPack)
        .filter((pack) => pack.sounds.length > 0),
    // `version` changes when one of these rooms' sound packs does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mx, roomIds, version]
  );

  return { user, rooms };
};

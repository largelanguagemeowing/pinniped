import { MatrixClient, Room } from 'matrix-js-sdk';
import { useAtomValue } from 'jotai';
import { useCallback, useMemo, useState } from 'react';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { StateEvent } from '../../types/matrix/room';
import {
  getGlobalSoundPacks,
  getRoomSoundPack,
  getUserSoundPack,
  ROOM_SOUND_PACK_STATE_KEY,
  SoundPack,
} from '../plugins/sound-pack';
import { updateGlobalPackList } from '../plugins/custom-emoji';
import { useAccountData } from './useAccountData';
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

/** The packs of the rooms the user enabled everywhere (see `setSoundPackGlobal`). */
export const useGlobalSoundPacks = (): SoundPack[] => {
  const mx = useMatrixClient();
  const list = useAccountData(AccountDataEvent.PinnipedSoundRooms);
  const [updateCount, forceUpdate] = useForceUpdate();

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === StateEvent.PinnipedRoomSounds) forceUpdate();
      },
      [forceUpdate]
    )
  );

  return useMemo(
    () => getGlobalSoundPacks(mx),
    // `list` and `updateCount` change when the list or a room's pack does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mx, list, updateCount]
  );
};

/** The non-empty sound packs of `rooms`. */
export const useRoomsSoundPacks = (rooms: Room[]): SoundPack[] => {
  const mx = useMatrixClient();
  const [updateCount, forceUpdate] = useForceUpdate();

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (
          mEvent.getType() === StateEvent.PinnipedRoomSounds &&
          rooms.some((room) => room.roomId === mEvent.getRoomId())
        ) {
          forceUpdate();
        }
      },
      [rooms, forceUpdate]
    )
  );

  return useMemo(
    () => rooms.map(getRoomSoundPack).filter((pack) => pack.sounds.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rooms, updateCount]
  );
};

let globalListQueue: Promise<unknown> = Promise.resolve();

/**
 * Enables or disables a room's soundboard for every call. Writes are queued and computed from
 * the newest account data, so quick toggles do not overwrite each other.
 */
export const setSoundPackGlobal = (
  mx: MatrixClient,
  roomId: string,
  enabled: boolean
): Promise<unknown> => {
  const address = [{ roomId, stateKey: ROOM_SOUND_PACK_STATE_KEY }];
  const write = globalListQueue
    .catch(() => undefined)
    .then(() =>
      mx.setAccountData(
        AccountDataEvent.PinnipedSoundRooms,
        updateGlobalPackList(
          mx.getAccountData(AccountDataEvent.PinnipedSoundRooms)?.getContent() ?? {},
          enabled ? address : [],
          enabled ? [] : address
        )
      )
    );
  globalListQueue = write;
  return write;
};

/**
 * The packs usable in a call in this room: the user's own, then the room's and its spaces', then
 * those of the rooms the user enabled everywhere.
 */
export const useCallSoundPacks = (room: Room): { user: SoundPack; rooms: SoundPack[] } => {
  const mx = useMatrixClient();
  const user = useUserSoundPack();
  const globalPacks = useGlobalSoundPacks();
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

  const contextPacks = useMemo(
    () =>
      roomIds
        .map((id) => mx.getRoom(id))
        .filter((r): r is Room => !!r)
        .map(getRoomSoundPack),
    // `version` changes when one of these rooms' sound packs does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mx, roomIds, version]
  );

  const rooms = useMemo(() => {
    const contextIds = new Set(contextPacks.map((pack) => pack.id));
    return contextPacks
      .concat(globalPacks.filter((pack) => !contextIds.has(pack.id)))
      .filter((pack) => pack.sounds.length > 0);
  }, [contextPacks, globalPacks]);

  return { user, rooms };
};

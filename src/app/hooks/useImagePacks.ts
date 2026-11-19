import { Room } from 'matrix-js-sdk';
import { useCallback, useMemo, useState } from 'react';
import { AccountDataEvent } from '../../types/matrix/accountData';
import {
  getGlobalImagePacks,
  getRoomImagePack,
  getRoomImagePacks,
  getUserImagePack,
  ImagePack,
  ImageUsage,
  isGlobalPackListEvent,
  PackAddress,
  roomPackFormatOf,
} from '../plugins/custom-emoji';
import { useMatrixClient } from './useMatrixClient';
import { useAccountDataCallback } from './useAccountDataCallback';
import { useStateEventCallback } from './useStateEventCallback';
import { useForceUpdate } from './useForceUpdate';

export const useUserImagePack = (): ImagePack | undefined => {
  const mx = useMatrixClient();
  const [userPack, setUserPack] = useState(() => getUserImagePack(mx));

  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getType() === AccountDataEvent.PoniesUserEmotes) {
          setUserPack(getUserImagePack(mx));
        }
      },
      [mx]
    )
  );

  return userPack;
};

export const useGlobalImagePacks = (): ImagePack[] => {
  const mx = useMatrixClient();
  const [globalPacks, setGlobalPacks] = useState(() => getGlobalImagePacks(mx));

  useAccountDataCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (isGlobalPackListEvent(mEvent.getType())) {
          setGlobalPacks(getGlobalImagePacks(mx));
        }
      },
      [mx]
    )
  );

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        const format = roomPackFormatOf(mEvent.getType());
        const roomId = mEvent.getRoomId();
        const stateKey = mEvent.getStateKey();
        if (format && roomId && typeof stateKey === 'string') {
          const global = !!globalPacks.find(
            (pack) =>
              pack.address &&
              pack.address.roomId === roomId &&
              pack.address.stateKey === stateKey &&
              pack.address.format === format
          );
          if (global) {
            setGlobalPacks(getGlobalImagePacks(mx));
          }
        }
      },
      [mx, globalPacks]
    )
  );

  return globalPacks;
};

export const useRoomImagePack = (room: Room, address: PackAddress): ImagePack | undefined => {
  const mx = useMatrixClient();
  const [updateCount, forceUpdate] = useForceUpdate();

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (
          mEvent.getRoomId() === room.roomId &&
          mEvent.getType() === address.format.stateEvent &&
          mEvent.getStateKey() === address.stateKey
        ) {
          forceUpdate();
        }
      },
      [room, address, forceUpdate]
    )
  );

  return useMemo(
    () => getRoomImagePack(room, address),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room, address, updateCount]
  );
};

export const useRoomImagePacks = (room: Room): ImagePack[] => {
  const mx = useMatrixClient();
  const [updateCount, forceUpdate] = useForceUpdate();

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (mEvent.getRoomId() === room.roomId && roomPackFormatOf(mEvent.getType())) {
          forceUpdate();
        }
      },
      [room, forceUpdate]
    )
  );

  return useMemo(
    () => getRoomImagePacks(room),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room, updateCount]
  );
};

export const useRoomsImagePacks = (rooms: Room[]) => {
  const mx = useMatrixClient();
  const [updateCount, forceUpdate] = useForceUpdate();

  useStateEventCallback(
    mx,
    useCallback(
      (mEvent) => {
        if (
          rooms.find((room) => room.roomId === mEvent.getRoomId()) &&
          roomPackFormatOf(mEvent.getType())
        ) {
          forceUpdate();
        }
      },
      [rooms, forceUpdate]
    )
  );

  return useMemo(
    () => rooms.flatMap(getRoomImagePacks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rooms, updateCount]
  );
};

export const useRelevantImagePacks = (usage: ImageUsage, rooms: Room[]): ImagePack[] => {
  const userPack = useUserImagePack();
  const globalPacks = useGlobalImagePacks();
  const roomsPacks = useRoomsImagePacks(rooms);

  const relevantPacks = useMemo(() => {
    const packs = userPack ? [userPack] : [];
    const globalPackIds = new Set(globalPacks.map((pack) => pack.id));

    const relPacks = packs.concat(
      globalPacks,
      roomsPacks.filter((pack) => !globalPackIds.has(pack.id))
    );

    return relPacks.filter((pack) => pack.getImages(usage).length > 0);
  }, [userPack, globalPacks, roomsPacks, usage]);

  return relevantPacks;
};

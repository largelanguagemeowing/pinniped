import { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import { ImagePack } from './ImagePack';
import { EmoteRoomsContent, ImageUsage, PackStateKeyToObject, RoomIdToStateKey } from './types';
import { getAccountData, getStateEvent, getStateEvents } from '../../utils/room';
import { AccountDataEvent } from '../../../types/matrix/accountData';
import { PackMetaReader } from './PackMetaReader';
import { PackAddress } from './PackAddress';
import { ROOM_PACK_FORMATS } from './PackFormat';

// state keys are room-controlled, so `__proto__` must not resolve to the prototype
const hasStateKey = (stateKeys: PackStateKeyToObject, stateKey: string): boolean =>
  Object.prototype.hasOwnProperty.call(stateKeys, stateKey);

export function packAddressEqual(a1?: PackAddress, a2?: PackAddress): boolean {
  if (!a1 && !a2) return true;
  if (!a1 || !a2) return false;
  return (
    a1.roomId === a2.roomId &&
    a1.stateKey === a2.stateKey &&
    a1.format.stateEvent === a2.format.stateEvent
  );
}

export function imageUsageEqual(u1: ImageUsage[], u2: ImageUsage[]) {
  return u1.length === u2.length && u1.every((u) => u2.includes(u));
}

export function packMetaEqual(a: PackMetaReader, b: PackMetaReader): boolean {
  return (
    a.name === b.name &&
    a.avatar === b.avatar &&
    a.attribution === b.attribution &&
    imageUsageEqual(a.usage, b.usage)
  );
}

export function makeImagePacks(packEvents: MatrixEvent[]): ImagePack[] {
  return packEvents.reduce<ImagePack[]>((imagePacks, packEvent) => {
    const packId = packEvent.getId();
    if (!packId) return imagePacks;
    imagePacks.push(ImagePack.fromMatrixEvent(packId, packEvent));
    return imagePacks;
  }, []);
}

export function getRoomImagePack(room: Room, address: PackAddress): ImagePack | undefined {
  const packEvent = getStateEvent(room, address.format.stateEvent, address.stateKey);
  if (!packEvent) return undefined;
  const packId = packEvent.getId();
  if (!packId) return undefined;
  return ImagePack.fromMatrixEvent(packId, packEvent);
}

export function getRoomImagePacks(room: Room): ImagePack[] {
  return makeImagePacks(
    ROOM_PACK_FORMATS.flatMap((format) => getStateEvents(room, format.stateEvent))
  );
}

export function getGlobalImagePacks(mx: MatrixClient): ImagePack[] {
  return ROOM_PACK_FORMATS.flatMap((format) => {
    const { rooms } =
      getAccountData(mx, format.globalListEvent)?.getContent<EmoteRoomsContent>() ?? {};
    if (typeof rooms !== 'object' || rooms === null) return [];

    return Object.entries(rooms).flatMap(([roomId, stateKeys]) => {
      if (typeof stateKeys !== 'object' || stateKeys === null) return [];
      const room = mx.getRoom(roomId);
      if (!room) return [];
      const globalPackEvents = getStateEvents(room, format.stateEvent).filter((mE) => {
        const stateKey = mE.getStateKey();
        return typeof stateKey === 'string' && hasStateKey(stateKeys, stateKey);
      });
      return makeImagePacks(globalPackEvents);
    });
  });
}

/**
 * Global pack list `content` with `added` packs listed and `removed` ones dropped, along with
 * rooms this leaves empty. Existing per-pack objects are kept; the spec reserves them.
 */
export function updateGlobalPackList(
  content: EmoteRoomsContent,
  added: PackAddress[],
  removed: PackAddress[]
): EmoteRoomsContent {
  const updated = structuredClone(content);
  const rooms: RoomIdToStateKey =
    typeof updated.rooms === 'object' && updated.rooms !== null ? updated.rooms : {};

  added.forEach(({ roomId, stateKey }) => {
    const stateKeys = rooms[roomId] ?? {};
    if (!hasStateKey(stateKeys, stateKey)) stateKeys[stateKey] = {};
    rooms[roomId] = stateKeys;
  });
  removed.forEach(({ roomId, stateKey }) => {
    const stateKeys = rooms[roomId];
    if (!stateKeys || !hasStateKey(stateKeys, stateKey)) return;
    delete stateKeys[stateKey];
    if (Object.keys(stateKeys).length === 0) delete rooms[roomId];
  });

  return { ...updated, rooms };
}

export function getUserImagePack(mx: MatrixClient): ImagePack | undefined {
  const packEvent = getAccountData(mx, AccountDataEvent.PoniesUserEmotes);
  const userId = mx.getUserId();
  if (!packEvent || !userId) {
    return undefined;
  }

  const userImagePack = ImagePack.fromMatrixEvent(userId, packEvent);
  return userImagePack;
}

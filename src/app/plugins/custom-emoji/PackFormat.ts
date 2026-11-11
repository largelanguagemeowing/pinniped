import { StateEvent } from '../../../types/matrix/room';
import { AccountDataEvent } from '../../../types/matrix/accountData';

/** Where a room pack lives (its state event type) and where users enable it for all rooms. */
export type RoomPackFormat = {
  stateEvent: typeof StateEvent.RoomImagePack | typeof StateEvent.PoniesRoomEmotes;
  globalListEvent:
    typeof AccountDataEvent.ImagePackRooms | typeof AccountDataEvent.PoniesEmoteRooms;
  /** Images may override the pack's usage; the spec dropped this from MSC2545. */
  perImageUsage: boolean;
};

/** Spec image packs (Matrix 1.19); new room packs are created in this format. */
export const SPEC_ROOM_PACK_FORMAT: RoomPackFormat = {
  stateEvent: StateEvent.RoomImagePack,
  globalListEvent: AccountDataEvent.ImagePackRooms,
  perImageUsage: false,
};

/** MSC2545's unstable packs, still read and edited in place. */
export const PONIES_ROOM_PACK_FORMAT: RoomPackFormat = {
  stateEvent: StateEvent.PoniesRoomEmotes,
  globalListEvent: AccountDataEvent.PoniesEmoteRooms,
  perImageUsage: true,
};

export const ROOM_PACK_FORMATS: readonly RoomPackFormat[] = [
  SPEC_ROOM_PACK_FORMAT,
  PONIES_ROOM_PACK_FORMAT,
];

export const roomPackFormatOf = (stateEventType: string): RoomPackFormat | undefined =>
  ROOM_PACK_FORMATS.find((format) => format.stateEvent === stateEventType);

export const isGlobalPackListEvent = (accountDataType: string): boolean =>
  ROOM_PACK_FORMATS.some((format) => format.globalListEvent === accountDataType);

const SHORTCODE_MAX_LENGTH = 100;

/**
 * `name` in the spec's shortcode grammar (`[A-Za-z0-9_-]{1,100}`): each run of other characters,
 * spaces included, becomes a dash.
 */
export const toShortcode = (name: string): string =>
  name.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, SHORTCODE_MAX_LENGTH);

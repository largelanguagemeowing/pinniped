import { IImageInfo } from '../../../types/matrix/common';

// https://spec.matrix.org/v1.19/client-server-api/#image-packs (MSC2545)

/**
 * m.image_pack.rooms (and im.ponies.emote_rooms) content
 */
export type PackStateKeyToObject = Record<string, object>;
export type RoomIdToStateKey = Record<string, PackStateKeyToObject>;
export type EmoteRoomsContent = {
  rooms?: RoomIdToStateKey;
};

/**
 * Pack
 */
export enum ImageUsage {
  Emoticon = 'emoticon',
  Sticker = 'sticker',
}

export type PackImage = {
  url: string;
  body?: string;
  /** Only in formats with `perImageUsage`. */
  usage?: ImageUsage[];
  info?: IImageInfo;
};

export type PackImages = Record<string, PackImage>;

export type PackMeta = {
  display_name?: string;
  avatar_url?: string;
  attribution?: string;
  usage?: ImageUsage[];
};

export type PackContent = {
  pack?: PackMeta;
  images?: PackImages;
};

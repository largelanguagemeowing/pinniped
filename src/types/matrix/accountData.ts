import { AccountDataEvents } from 'matrix-js-sdk';

export enum AccountDataEvent {
  PushRules = 'm.push_rules',
  Direct = 'm.direct',
  IgnoredUserList = 'm.ignored_user_list',

  CinnySpaces = 'in.cinny.spaces',

  PinnipedRoomOrder = 'club.stablecat.pinniped.room_order',
  PinnipedGifFavorites = 'club.stablecat.pinniped.gif_favorites',
  PinnipedLeftRooms = 'club.stablecat.pinniped.left_rooms',
  PinnipedStatusMessage = 'club.stablecat.pinniped.status_message',
  PinnipedUserSounds = 'club.stablecat.pinniped.user_sounds',
  PinnipedSoundFavorites = 'club.stablecat.pinniped.sound_favorites',

  ElementRecentEmoji = 'io.element.recent_emoji',
  PinnipedEmojiFavorites = 'club.stablecat.pinniped.emoji_favorites',
  PinnipedRecentCustomEmoji = 'club.stablecat.pinniped.recent_custom_emoji',

  PoniesUserEmotes = 'im.ponies.user_emotes',
  PoniesEmoteRooms = 'im.ponies.emote_rooms',

  SecretStorageDefaultKey = 'm.secret_storage.default_key',

  CrossSigningMaster = 'm.cross_signing.master',
  CrossSigningSelf = 'm.cross_signing.self',
  CrossSigningUser = 'm.cross_signing.user',
  MegolmBackupV1 = 'm.megolm_backup.v1',
}

/** Pre-rename `im.kibby.*` account data types, migrated to their Pinniped equivalents. */
export const LEGACY_ACCOUNT_DATA_MIGRATIONS: [
  legacy: keyof AccountDataEvents,
  current: keyof AccountDataEvents,
][] = [
  ['im.kibby.room_order', AccountDataEvent.PinnipedRoomOrder],
  ['im.kibby.gif_favorites', AccountDataEvent.PinnipedGifFavorites],
  ['im.kibby.left_rooms', AccountDataEvent.PinnipedLeftRooms],
];

export type MDirectContent = Record<string, string[]>;

export type SecretStorageDefaultKeyContent = {
  key: string;
};

export type SecretStoragePassphraseContent = {
  algorithm: string;
  salt: string;
  iterations: number;
  bits?: number;
};

export type SecretStorageKeyContent = {
  name?: string;
  algorithm: string;
  iv?: string;
  mac?: string;
  passphrase?: SecretStoragePassphraseContent;
};

export type SecretContent = {
  iv: string;
  ciphertext: string;
  mac: string;
};

export type SecretAccountData = {
  encrypted: Record<string, SecretContent>;
};

/**
 * How rooms within a space are ordered in the per-user sidebar nav.
 * - `default`: canonical order from the `m.space.child` state events
 * - `custom`: user-defined manual order, persisted in `KibbyRoomOrderContent.orders`
 */
export type RoomSortMode = 'default' | 'custom';

type StoredRoomSortMode = RoomSortMode | 'alpha' | 'activity';

/**
 * Per-user room ordering, synced across devices via account data.
 * `sortModes` maps a root space roomId to the selected sort mode for that space.
 * `orders` maps a parent space roomId to the ordered list of child roomIds,
 * used only while that parent's section is in `custom` sort mode.
 */
export type KibbyRoomOrderContent = {
  sortModes?: Record<string, StoredRoomSortMode>;
  orders?: Record<string, string[]>;
};

/**
 * Soundboard sound packs, modelled on emoji packs (im.ponies): the user's own pack is account
 * data (`club.stablecat.pinniped.user_sounds`), a room's or space's pack is a state event
 * (`club.stablecat.pinniped.room_sounds`, empty state key).
 */
export type SoundInfo = {
  mimetype?: string;
  /** Bytes. */
  size?: number;
  /** Milliseconds. */
  duration?: number;
};

import type { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';

export type SoundMode = 'cut' | 'add';

export type PackSound = {
  /** mxc:// URL of the audio file. */
  url: string;
  name?: string;
  /** A single emoji shown next to the name. */
  emoji?: string;
  /**
   * What playing the sound again while it still plays does: 'cut' starts it over from the
   * beginning, 'add' layers another copy on top. Absent means 'add'.
   */
  mode?: SoundMode;
  info?: SoundInfo;
  /** Set when the file is encrypted (sounds uploaded in an encrypted room). */
  file?: EncryptedAttachmentInfo;
};

export type PackMeta = {
  display_name?: string;
  avatar_url?: string;
};

export type SoundPackContent = {
  pack?: PackMeta;
  sounds?: Record<string, PackSound>;
};

/** Limits for uploaded sounds: a soundboard clip, not a song. */
export const MAX_SOUND_BYTES = 1024 * 1024;
export const MAX_SOUND_MS = 10_000;

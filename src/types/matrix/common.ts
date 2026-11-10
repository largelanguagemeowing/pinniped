import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { MsgType } from 'matrix-js-sdk';

export const MATRIX_BLUR_HASH_PROPERTY_NAME = 'xyz.amorgan.blurhash';
export const MATRIX_SPOILER_PROPERTY_NAME = 'page.codeberg.everypizza.msc4193.spoiler';
export const MATRIX_SPOILER_REASON_PROPERTY_NAME =
  'page.codeberg.everypizza.msc4193.spoiler.reason';
/** Marks an `m.video` that should behave like a GIF: looped, muted, no controls. */
export const MATRIX_GIF_PROPERTY_NAME = 'club.stablecat.pinniped.gif';
/** The name the marker was sent under before it moved to Pinniped's namespace. */
const LEGACY_GIF_PROPERTY_NAME = 'io.cinny.gif';
/** The same marker as bridges and other clients send it, inside `info`. */
const MAUTRIX_GIF_INFO_PROPERTY_NAME = 'fi.mau.gif';

/** Whether a video message asks to be shown as a GIF, under any of the names in use. */
export const isGifVideoContent = (content: Record<string, unknown>): boolean => {
  if (content[MATRIX_GIF_PROPERTY_NAME] === true || content[LEGACY_GIF_PROPERTY_NAME] === true) {
    return true;
  }
  const { info } = content;
  return (
    typeof info === 'object' &&
    info !== null &&
    (info as Record<string, unknown>)[MAUTRIX_GIF_INFO_PROPERTY_NAME] === true
  );
};

export type IImageInfo = {
  w?: number;
  h?: number;
  mimetype?: string;
  size?: number;
  [MATRIX_BLUR_HASH_PROPERTY_NAME]?: string;
};

export type IVideoInfo = {
  w?: number;
  h?: number;
  mimetype?: string;
  size?: number;
  duration?: number;
};

export type IAudioInfo = {
  mimetype?: string;
  size?: number;
  duration?: number;
};

export type IFileInfo = {
  mimetype?: string;
  size?: number;
};

export type IEncryptedFile = EncryptedAttachmentInfo & {
  url: string;
};

export type IThumbnailContent = {
  thumbnail_info?: IImageInfo;
  thumbnail_file?: IEncryptedFile;
  thumbnail_url?: string;
};

export type IImageContent = {
  msgtype: MsgType.Image;
  body?: string;
  filename?: string;
  url?: string;
  info?: IImageInfo & IThumbnailContent;
  file?: IEncryptedFile;
  [MATRIX_SPOILER_PROPERTY_NAME]?: boolean;
  [MATRIX_SPOILER_REASON_PROPERTY_NAME]?: string;
};

export type IVideoContent = {
  msgtype: MsgType.Video;
  body?: string;
  filename?: string;
  url?: string;
  info?: IVideoInfo & IThumbnailContent;
  file?: IEncryptedFile;
  [MATRIX_GIF_PROPERTY_NAME]?: boolean;
  [MATRIX_SPOILER_PROPERTY_NAME]?: boolean;
  [MATRIX_SPOILER_REASON_PROPERTY_NAME]?: string;
};

export const MATRIX_VOICE_PROPERTY_NAME = 'org.matrix.msc3245.voice';
export const MATRIX_AUDIO_PROPERTY_NAME = 'org.matrix.msc1767.audio';

export type IAudioContent = {
  msgtype: MsgType.Audio;
  /** MSC3245: present on a voice message. */
  [MATRIX_VOICE_PROPERTY_NAME]?: Record<string, never>;
  /** MSC1767: the duration and the waveform (samples 0-1024) of a voice message. */
  [MATRIX_AUDIO_PROPERTY_NAME]?: { duration?: number; waveform?: number[] };
  body?: string;
  filename?: string;
  url?: string;
  info?: IAudioInfo;
  file?: IEncryptedFile;
};

export type IFileContent = {
  msgtype: MsgType.File;
  body?: string;
  filename?: string;
  url?: string;
  info?: IFileInfo & IThumbnailContent;
  file?: IEncryptedFile;
};

export type ILocationContent = {
  msgtype: MsgType.Location;
  body?: string;
  geo_uri?: string;
  info?: IThumbnailContent;
};

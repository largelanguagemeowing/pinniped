import { MsgType } from 'matrix-js-sdk';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';

/** The original file of an m.image event. */
export type ImageAttachment = {
  mxc: string;
  mimetype?: string;
  /** Present for an encrypted attachment. */
  encInfo?: EncryptedAttachmentInfo;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isMxc = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('mxc://');

const encryptedInfo = (file: Record<string, unknown>): EncryptedAttachmentInfo | undefined => {
  const { v, key, iv, hashes } = file;
  if (typeof v !== 'string' || typeof iv !== 'string') return undefined;
  if (!isRecord(key) || !isRecord(hashes)) return undefined;
  const { alg, key_ops: keyOps, kty, k, ext } = key;
  if (typeof alg !== 'string' || typeof kty !== 'string' || typeof k !== 'string') return undefined;
  if (!Array.isArray(keyOps) || !keyOps.every((op) => typeof op === 'string')) return undefined;
  const hashEntries = Object.entries(hashes);
  if (!hashEntries.every(([, hash]) => typeof hash === 'string')) return undefined;
  return {
    v,
    iv,
    key: { alg, key_ops: keyOps, kty, k, ext: ext === true },
    hashes: Object.fromEntries(hashEntries) as Record<string, string>,
  };
};

export const imageAttachment = (content: unknown): ImageAttachment | undefined => {
  if (!isRecord(content) || content.msgtype !== MsgType.Image) return undefined;
  const mimetype =
    isRecord(content.info) && typeof content.info.mimetype === 'string'
      ? content.info.mimetype
      : undefined;
  if (isRecord(content.file)) {
    const encInfo = encryptedInfo(content.file);
    return encInfo && isMxc(content.file.url)
      ? { mxc: content.file.url, mimetype, encInfo }
      : undefined;
  }
  return isMxc(content.url) ? { mxc: content.url, mimetype } : undefined;
};

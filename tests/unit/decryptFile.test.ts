import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encryptAttachment, EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import {
  AttachmentTamperedError,
  AttachmentUnreadableError,
  decryptFile,
} from '../../src/app/utils/matrix';

// The browser library reads `window.crypto`. Node's WebCrypto is the same API, so the tests run
// the real encrypt, hash check, and key import.
const previousWindow = (globalThis as { window?: unknown }).window;
beforeAll(() => {
  (globalThis as { window?: unknown }).window = {
    crypto: globalThis.crypto,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
  };
});
afterAll(() => {
  (globalThis as { window?: unknown }).window = previousWindow;
});

const plaintext = new TextEncoder().encode('hello attachment');

const encryptSample = async () => {
  const { data, info } = await encryptAttachment(plaintext.slice().buffer);
  return { ciphertext: data, info };
};

describe('decryptFile', () => {
  it('decrypts an attachment encrypted with the library', async () => {
    const { ciphertext, info } = await encryptSample();
    const blob = await decryptFile(ciphertext, 'text/plain', info);
    expect(await blob.text()).toBe('hello attachment');
    expect(blob.type).toBe('text/plain');
  });

  it('reports altered ciphertext as tampered', async () => {
    const { ciphertext, info } = await encryptSample();
    const altered = new Uint8Array(ciphertext.slice(0));
    altered[0] ^= 0xff;
    await expect(decryptFile(altered.buffer, 'text/plain', info)).rejects.toBeInstanceOf(
      AttachmentTamperedError
    );
  });

  it('reports missing file info as unreadable', async () => {
    const { ciphertext } = await encryptSample();
    await expect(
      decryptFile(ciphertext, 'text/plain', undefined as unknown as EncryptedAttachmentInfo)
    ).rejects.toBeInstanceOf(AttachmentUnreadableError);
  });

  it('reports a malformed key as unreadable', async () => {
    const { ciphertext, info } = await encryptSample();
    const badInfo = { ...info, key: { ...info.key, k: 'short' } };
    await expect(decryptFile(ciphertext, 'text/plain', badInfo)).rejects.toBeInstanceOf(
      AttachmentUnreadableError
    );
  });
});

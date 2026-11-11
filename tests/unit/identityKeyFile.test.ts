import { describe, expect, it, vi } from 'vitest';
import { exportIdentityKeyFile, importIdentityKeyFile } from '../../src/app/utils/identityKeyFile';

const bundle = {
  cross_signing: { master_key: 'm', self_signing_key: 's', user_signing_key: 'u' },
};
const held = { masterKey: true, selfSigningKey: true, userSigningKey: true };

const makeCrypto = (over: Record<string, unknown> = {}) => {
  const imported: unknown[] = [];
  const crypto = {
    getCrossSigningStatus: async () => ({ privateKeysCachedLocally: held }),
    exportSecretsBundle: vi.fn(async () => bundle),
    importSecretsBundle: vi.fn(async (b: unknown) => void imported.push(b)),
    crossSignDevice: vi.fn(async () => {}),
    ...over,
  };
  return { crypto: crypto as never, imported, raw: crypto };
};

describe('identity key file', () => {
  it('exports the SDK bundle as plain JSON, as the person chose', async () => {
    const text = await exportIdentityKeyFile(makeCrypto().crypto);
    expect(JSON.parse(text)).toEqual(bundle);
  });

  it('round-trips, and signs the device after importing', async () => {
    const text = await exportIdentityKeyFile(makeCrypto().crypto);
    const dest = makeCrypto();
    await importIdentityKeyFile(dest.crypto, 'DEV', text);
    expect(dest.imported).toEqual([bundle]);
    expect(dest.raw.crossSignDevice).toHaveBeenCalledWith('DEV');
  });

  it('refuses to export when this device lacks the keys', async () => {
    const { crypto, raw } = makeCrypto({
      getCrossSigningStatus: async () => ({
        privateKeysCachedLocally: { ...held, userSigningKey: false },
      }),
    });
    await expect(exportIdentityKeyFile(crypto)).rejects.toThrow('does not hold your identity keys');
    expect(raw.exportSecretsBundle).not.toHaveBeenCalled();
  });

  it('imports the message backup key along with the identity', async () => {
    const withBackup = {
      ...bundle,
      backup: {
        algorithm: 'm.megolm_backup.v1.curve25519-aes-sha2',
        key: 'k',
        backup_version: '3',
      },
    };
    const dest = makeCrypto();
    await importIdentityKeyFile(dest.crypto, 'DEV', JSON.stringify(withBackup));
    expect(dest.imported).toEqual([withBackup]);
  });

  it('explains when the library cannot export or import', async () => {
    await expect(
      exportIdentityKeyFile(makeCrypto({ exportSecretsBundle: undefined }).crypto)
    ).rejects.toThrow('cannot export');
    await expect(
      importIdentityKeyFile(makeCrypto({ importSecretsBundle: undefined }).crypto, 'DEV', '{}')
    ).rejects.toThrow('cannot import');
  });

  it.each([
    ['not JSON', 'hello'],
    ['a message key export', JSON.stringify([{ session_id: 'x' }])],
    ['a bundle missing a key', JSON.stringify({ cross_signing: { master_key: 'm' } })],
    [
      'a bundle with a malformed backup key',
      JSON.stringify({ ...bundle, backup: { algorithm: 'm.megolm_backup.v1', key: 5 } }),
    ],
  ])('rejects %s and imports nothing', async (_name, text) => {
    const dest = makeCrypto();
    await expect(importIdentityKeyFile(dest.crypto, 'DEV', text)).rejects.toThrow(
      'does not contain identity keys'
    );
    expect(dest.imported).toEqual([]);
    expect(dest.raw.crossSignDevice).not.toHaveBeenCalled();
  });
});

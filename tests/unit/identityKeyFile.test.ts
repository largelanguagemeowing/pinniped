import { beforeAll, describe, expect, it, vi } from 'vitest';

// The key file code reads window.crypto and window.atob, which Node has on globalThis.
vi.stubGlobal('window', globalThis);

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
    bootstrapCrossSigning: vi.fn(async () => {}),
    ...over,
  };
  return { crypto: crypto as never, imported, raw: crypto };
};
const toBuffer = (data: ArrayBuffer | string): ArrayBuffer =>
  typeof data === 'string' ? (new TextEncoder().encode(data).buffer as ArrayBuffer) : data;

type Mod = typeof import('../../src/app/utils/identityKeyFile');
let exportIdentityKeyFile: Mod['exportIdentityKeyFile'];
let importIdentityKeyFile: Mod['importIdentityKeyFile'];

describe('identity key file', () => {
  beforeAll(async () => {
    ({ exportIdentityKeyFile, importIdentityKeyFile } =
      await import('../../src/app/utils/identityKeyFile'));
  });

  it('round-trips through a password, and signs the device after importing', async () => {
    const out = makeCrypto();
    const file = await exportIdentityKeyFile(out.crypto, 'correct horse');
    expect(new TextDecoder().decode(file)).not.toContain('master_key');

    const dest = makeCrypto();
    await importIdentityKeyFile(dest.crypto, toBuffer(file), 'correct horse');
    expect(dest.imported).toEqual([bundle]);
    expect(dest.raw.bootstrapCrossSigning).toHaveBeenCalledWith({});
  }, 30000);

  it('refuses the wrong password and imports nothing', async () => {
    const file = await exportIdentityKeyFile(makeCrypto().crypto, 'right');
    const dest = makeCrypto();
    await expect(importIdentityKeyFile(dest.crypto, toBuffer(file), 'wrong')).rejects.toThrow();
    expect(dest.imported).toEqual([]);
  }, 30000);

  it('refuses to export when this device lacks the keys', async () => {
    const { crypto, raw } = makeCrypto({
      getCrossSigningStatus: async () => ({
        privateKeysCachedLocally: { ...held, userSigningKey: false },
      }),
    });
    await expect(exportIdentityKeyFile(crypto, 'pw')).rejects.toThrow(
      'does not hold your identity keys'
    );
    expect(raw.exportSecretsBundle).not.toHaveBeenCalled();
  });

  it('explains when the library cannot export or import', async () => {
    await expect(
      exportIdentityKeyFile(makeCrypto({ exportSecretsBundle: undefined }).crypto, 'pw')
    ).rejects.toThrow('cannot export');
    await expect(
      importIdentityKeyFile(
        makeCrypto({ importSecretsBundle: undefined }).crypto,
        toBuffer('x'),
        'pw'
      )
    ).rejects.toThrow('cannot import');
  });

  it('rejects a file that is not an identity key file, importing nothing', async () => {
    const { encryptMegolmKeyFile } = await import('../../src/util/cryptE2ERoomKeys');
    const messageKeys = await encryptMegolmKeyFile(JSON.stringify([{ session_id: 'x' }]), 'pw');
    const dest = makeCrypto();
    await expect(importIdentityKeyFile(dest.crypto, toBuffer(messageKeys), 'pw')).rejects.toThrow(
      'does not contain identity keys'
    );
    expect(dest.imported).toEqual([]);
    expect(dest.raw.bootstrapCrossSigning).not.toHaveBeenCalled();
  }, 30000);
});

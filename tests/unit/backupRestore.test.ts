import { beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreKeyBackupAndRecord } from '../../src/app/utils/backupRestore';
import { isBackupRestored } from '../../src/app/state/backupRestored';

const fakeCrypto = (opts: {
  active?: string | null;
  serverVersion?: string;
  restore?: () => Promise<{ total: number; imported: number }>;
}) => ({
  restoreKeyBackup: vi.fn(opts.restore ?? (async () => ({ total: 4, imported: 3 }))),
  getActiveSessionBackupVersion: async () => opts.active ?? null,
  getKeyBackupInfo: async () => (opts.serverVersion ? { version: opts.serverVersion } : null),
});

describe('restoreKeyBackupAndRecord', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
  });

  it('records the restore for the active backup version and returns the result', async () => {
    const crypto = fakeCrypto({ active: '7' });
    const result = await restoreKeyBackupAndRecord(crypto as never, '@me:x', 'DEV1');
    expect(result).toEqual({ total: 4, imported: 3 });
    expect(isBackupRestored('@me:x', 'DEV1', '7')).toBe(true);
  });

  it('falls back to the server version when no backup is active', async () => {
    const crypto = fakeCrypto({ active: null, serverVersion: '9' });
    await restoreKeyBackupAndRecord(crypto as never, '@me:x', 'DEV2');
    expect(isBackupRestored('@me:x', 'DEV2', '9')).toBe(true);
  });

  it('records per device and per version, so a new backup is offered again', async () => {
    await restoreKeyBackupAndRecord(fakeCrypto({ active: '1' }) as never, '@me:x', 'DEV3');
    expect(isBackupRestored('@me:x', 'DEV3', '1')).toBe(true);
    expect(isBackupRestored('@me:x', 'DEV3', '2')).toBe(false);
    expect(isBackupRestored('@me:x', 'OTHER', '1')).toBe(false);
  });

  it('records nothing when the restore fails, so the button stays', async () => {
    const crypto = fakeCrypto({
      active: '1',
      restore: async () => {
        throw new Error('no decryption key');
      },
    });
    await expect(restoreKeyBackupAndRecord(crypto as never, '@me:x', 'DEV4')).rejects.toThrow(
      'no decryption key'
    );
    expect(isBackupRestored('@me:x', 'DEV4', '1')).toBe(false);
  });

  it('passes progress through to the SDK', async () => {
    const crypto = fakeCrypto({ active: '1' });
    const onProgress = vi.fn();
    await restoreKeyBackupAndRecord(crypto as never, '@me:x', 'DEV5', onProgress);
    expect(crypto.restoreKeyBackup).toHaveBeenCalledWith({ progressCallback: onProgress });
  });
});

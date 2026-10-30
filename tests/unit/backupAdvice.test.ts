import { describe, expect, it } from 'vitest';
import { KeyBackupInfo } from 'matrix-js-sdk/lib/crypto-api';
import { backupAdvice } from '../../src/app/utils/backupAdvice';

const info = (count: number): KeyBackupInfo =>
  ({
    version: '1',
    count,
    etag: 'e',
    algorithm: 'm.megolm_backup.v1.curve25519-aes-sha2',
  }) as never;
const canOpen = { matchesDecryptionKey: true };
const cannotOpen = { matchesDecryptionKey: false };

describe('backupAdvice', () => {
  it('says nothing until the backup info is known', () => {
    expect(backupAdvice(undefined, undefined, false)).toEqual({ kind: 'loading' });
  });

  it('says there is no backup when the server has none', () => {
    expect(backupAdvice(null, undefined, false)).toEqual({ kind: 'none' });
    expect(backupAdvice(null, canOpen, true)).toEqual({ kind: 'none' });
  });

  it('waits for the trust answer before judging an existing backup', () => {
    expect(backupAdvice(info(5), undefined, false)).toEqual({ kind: 'loading' });
  });

  it('calls the backup locked when this device cannot open it, so Restore is not offered', () => {
    expect(backupAdvice(info(5), cannotOpen, false)).toEqual({ kind: 'locked' });
  });

  it('stays locked even if a restore was recorded, since the key is what is missing now', () => {
    expect(backupAdvice(info(5), cannotOpen, true)).toEqual({ kind: 'locked' });
  });

  it('offers Restore when the device can open a backup it has not restored', () => {
    expect(backupAdvice(info(12), canOpen, false)).toEqual({ kind: 'restore', keys: 12 });
  });

  it('stops offering Restore once it has been restored', () => {
    expect(backupAdvice(info(12), canOpen, true)).toEqual({ kind: 'ok' });
  });

  it('has nothing to restore from an empty backup', () => {
    expect(backupAdvice(info(0), canOpen, false)).toEqual({ kind: 'ok' });
  });
});

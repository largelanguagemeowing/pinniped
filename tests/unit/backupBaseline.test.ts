import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isBackupRestored, settleBackupBaseline } from '../../src/app/state/backupRestored';

describe('settleBackupBaseline', () => {
  let n = 0;
  let device = '';

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    // flags are kept for the whole run, so each test gets its own device
    n += 1;
    device = `DEV${n}`;
  });

  it('does nothing while the backup state is still loading', () => {
    settleBackupBaseline('@me:x', device, 'loading', '1');
    // loading did not settle the baseline, so a later answer still counts as the first
    settleBackupBaseline('@me:x', device, 'restore', '1');
    expect(isBackupRestored('@me:x', device, '1')).toBe(true);
  });

  it('treats a backup the device can already open as restored the first time', () => {
    settleBackupBaseline('@me:x', device, 'restore', '1');
    expect(isBackupRestored('@me:x', device, '1')).toBe(true);
  });

  it('leaves a locked device alone, so it is asked when its key arrives later', () => {
    settleBackupBaseline('@me:x', device, 'locked', '1');
    expect(isBackupRestored('@me:x', device, '1')).toBe(false);

    // the key arrives in this session: the baseline was already settled, so it is not adopted
    settleBackupBaseline('@me:x', device, 'restore', '1');
    expect(isBackupRestored('@me:x', device, '1')).toBe(false);
  });

  it('only ever settles once per device', () => {
    settleBackupBaseline('@me:x', device, 'ok', '1');
    settleBackupBaseline('@me:x', device, 'restore', '2');
    expect(isBackupRestored('@me:x', device, '2')).toBe(false);
  });

  it.each(['none', 'ok'] as const)(
    'settles without marking anything when the state is %s',
    (kind) => {
      settleBackupBaseline('@me:x', device, kind, '1');
      expect(isBackupRestored('@me:x', device, '1')).toBe(false);
    }
  );

  it('is per device and per user', () => {
    settleBackupBaseline('@me:x', device, 'restore', '1');
    expect(isBackupRestored('@me:x', `${device}-other`, '1')).toBe(false);
    expect(isBackupRestored('@someone:x', device, '1')).toBe(false);
  });
});

import React from 'react';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestoreBackupPrompt } from '../../src/app/components/RestoreBackupPrompt';
import { isBackupRestored } from '../../src/app/state/backupRestored';

const state = vi.hoisted(() => ({
  // Flags live for the whole run, so every test gets a device and a backup version of its own.
  n: 0,
  version: '',
  deviceId: '',
  info: undefined as { version: string; count: number } | null | undefined,
  matchesDecryptionKey: true,
  restore: undefined as unknown as () => Promise<{ total: number; imported: number }>,
  restoreCalls: 0,
}));

// Portals and focus traps need a browser; the dialog contents are what is under test.
vi.mock('folds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('folds')>()),
  Overlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OverlayCenter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OverlayBackdrop: () => null,
}));
vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../src/app/hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    getSafeUserId: () => '@me:x',
    getDeviceId: () => state.deviceId,
    getCrypto: () => ({
      restoreKeyBackup: vi.fn(() => {
        state.restoreCalls += 1;
        return state.restore();
      }),
      getActiveSessionBackupVersion: async () => state.version,
      getKeyBackupInfo: async () => ({ version: state.version }),
    }),
  }),
}));
vi.mock('../../src/app/hooks/useKeyBackup', () => ({
  useKeyBackupInfo: () => state.info,
  useKeyBackupTrust: () => ({ trusted: true, matchesDecryptionKey: state.matchesDecryptionKey }),
}));

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

describe('RestoreBackupPrompt', () => {
  let r: ReactTestRenderer;
  const mount = async () => {
    await act(async () => {
      r = create(<RestoreBackupPrompt />);
    });
  };
  const rerender = async () => {
    await act(async () => {
      r.update(<RestoreBackupPrompt />);
    });
  };
  // A device you just signed in on: locked at first, and the key arrives later in the session.
  const mountNewDevice = async () => {
    state.matchesDecryptionKey = false;
    await mount();
    state.matchesDecryptionKey = true;
    await rerender();
  };
  const button = (label: string) =>
    r.root.findAll((n) => n.type === 'button' && textOf(n).includes(label))[0];
  const all = () => textOf(r.root);

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    state.n += 1;
    state.deviceId = `DEV${state.n}`;
    state.version = String(state.n);
    state.info = { version: state.version, count: 5 };
    state.matchesDecryptionKey = true;
    state.restoreCalls = 0;
    state.restore = async () => ({ total: 5, imported: 5 });
  });
  afterEach(() => act(() => r.unmount()));

  describe('on a device you just signed in on', () => {
    it('asks once its key arrives, and says plainly that the backup cannot be checked', async () => {
      await mountNewDevice();
      expect(all()).toContain('Restore older messages?');
      expect(all()).toContain('Its admin cannot read it, but could have added keys to it');
      expect(all()).toContain('forged messages could appear');
      expect(all()).toContain('grey shield');
      expect(button('Restore from backup')).toBeDefined();
      expect(button('Not now')).toBeDefined();
    });

    it('never restores by itself', async () => {
      await mountNewDevice();
      await act(async () => {});
      expect(state.restoreCalls).toBe(0);
      expect(isBackupRestored('@me:x', state.deviceId, state.version)).toBe(false);
    });

    it('restores only when the person says yes, then closes', async () => {
      await mountNewDevice();
      await act(async () => button('Restore from backup').props.onClick());
      expect(state.restoreCalls).toBe(1);
      expect(isBackupRestored('@me:x', state.deviceId, state.version)).toBe(true);
      expect(r.toJSON()).toBeNull();
    });

    it('does not restore and stays closed after Not now, even on the next launch', async () => {
      await mountNewDevice();
      await act(async () => button('Not now').props.onClick());
      expect(state.restoreCalls).toBe(0);
      expect(r.toJSON()).toBeNull();

      act(() => r.unmount());
      await mount();
      expect(r.toJSON()).toBeNull();
      expect(state.restoreCalls).toBe(0);
    });

    it('keeps asking, with the reason, when the restore fails', async () => {
      state.restore = async () => {
        throw new Error('Decryption key does not match');
      };
      await mountNewDevice();
      await act(async () => button('Restore from backup').props.onClick());
      expect(all()).toContain('Decryption key does not match');
      expect(button('Restore from backup')).toBeDefined();
    });

    it('disables both choices while it restores', async () => {
      let finish: (value: { total: number; imported: number }) => void = () => {};
      state.restore = () => new Promise((resolve) => (finish = resolve));
      await mountNewDevice();
      await act(async () => {
        button('Restore from backup').props.onClick();
      });
      expect(button('Restore from backup').props.disabled).toBe(true);
      expect(button('Not now').props.disabled).toBe(true);
      await act(async () => finish({ total: 5, imported: 5 }));
    });
  });

  describe('on a device that could already open the backup when it started', () => {
    it('does not ask, because the old app restored on its own', async () => {
      await mount();
      expect(r.toJSON()).toBeNull();
      expect(state.restoreCalls).toBe(0);
    });

    it('counts that backup as restored, so Settings does not offer to restore it either', async () => {
      await mount();
      expect(isBackupRestored('@me:x', state.deviceId, state.version)).toBe(true);
    });

    it('still asks about a different backup that it can open later', async () => {
      await mount();
      expect(r.toJSON()).toBeNull();

      // another device reset the backup and shared the new key: a new version, never restored here
      state.version = `${state.version}-new`;
      state.info = { version: state.version, count: 3 };
      await rerender();
      expect(all()).toContain('Restore older messages?');
    });
  });

  it.each([
    ['this device cannot open the backup', () => (state.matchesDecryptionKey = false)],
    ['there is no backup', () => (state.info = null)],
    ['the backup is empty', () => (state.info = { version: state.version, count: 0 })],
    ['the backup info has not loaded', () => (state.info = undefined)],
  ])('does not ask when %s', async (_name, arrange) => {
    arrange();
    await mount();
    expect(r.toJSON()).toBeNull();
  });
});

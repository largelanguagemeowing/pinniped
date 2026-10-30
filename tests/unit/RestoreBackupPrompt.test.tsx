import React from 'react';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RestoreBackupPrompt } from '../../src/app/components/RestoreBackupPrompt';
import { isBackupRestored } from '../../src/app/state/backupRestored';

const state = vi.hoisted(() => ({
  // Flags live for the whole run, so every test uses a backup version of its own.
  version: 0,
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
    getDeviceId: () => 'DEV1',
    getCrypto: () => ({
      restoreKeyBackup: vi.fn(() => {
        state.restoreCalls += 1;
        return state.restore();
      }),
      getActiveSessionBackupVersion: async () => String(state.version),
      getKeyBackupInfo: async () => ({ version: String(state.version) }),
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
    state.version += 1;
    state.info = { version: String(state.version), count: 5 };
    state.matchesDecryptionKey = true;
    state.restoreCalls = 0;
    state.restore = async () => ({ total: 5, imported: 5 });
  });
  afterEach(() => act(() => r.unmount()));

  it('asks, and says plainly that the backup cannot be checked', async () => {
    await mount();
    expect(all()).toContain('Restore older messages?');
    expect(all()).toContain('its admin could have added keys to it');
    expect(all()).toContain('grey shield');
    expect(button('Restore from backup')).toBeDefined();
    expect(button('Not now')).toBeDefined();
  });

  it('never restores by itself', async () => {
    await mount();
    await act(async () => {});
    expect(state.restoreCalls).toBe(0);
    expect(isBackupRestored('@me:x', 'DEV1', String(state.version))).toBe(false);
  });

  it('restores only when the person says yes, then closes', async () => {
    await mount();
    await act(async () => button('Restore from backup').props.onClick());
    expect(state.restoreCalls).toBe(1);
    expect(isBackupRestored('@me:x', 'DEV1', String(state.version))).toBe(true);
    expect(r.toJSON()).toBeNull();
  });

  it('does not restore and stays closed after Not now, even on the next launch', async () => {
    await mount();
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
    await mount();
    await act(async () => button('Restore from backup').props.onClick());
    expect(all()).toContain('Decryption key does not match');
    expect(button('Restore from backup')).toBeDefined();
  });

  it('disables both choices while it restores', async () => {
    let finish: (value: { total: number; imported: number }) => void = () => {};
    state.restore = () => new Promise((resolve) => (finish = resolve));
    await mount();
    await act(async () => {
      button('Restore from backup').props.onClick();
    });
    expect(button('Restore from backup').props.disabled).toBe(true);
    expect(button('Not now').props.disabled).toBe(true);
    await act(async () => finish({ total: 5, imported: 5 }));
  });

  it.each([
    ['this device cannot open the backup', () => (state.matchesDecryptionKey = false)],
    ['there is no backup', () => (state.info = null)],
    ['the backup is empty', () => (state.info = { version: String(state.version), count: 0 })],
    ['the backup info has not loaded', () => (state.info = undefined)],
  ])('does not ask when %s', async (_name, arrange) => {
    arrange();
    await mount();
    expect(r.toJSON()).toBeNull();
  });
});

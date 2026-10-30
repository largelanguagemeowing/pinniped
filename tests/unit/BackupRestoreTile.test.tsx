import React from 'react';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupRestoreTile } from '../../src/app/components/BackupRestore';
import { isBackupRestored } from '../../src/app/state/backupRestored';

const state = vi.hoisted(() => ({
  // The restored flag lives for the whole run, so every test uses a backup version of its own.
  version: 0,
  info: undefined as { version: string; count: number } | null | undefined,
  matchesDecryptionKey: true,
  keyId: 'KEY' as string | undefined,
  restore: undefined as unknown as () => Promise<{ total: number; imported: number }>,
  resetCalls: 0,
  deleteCalls: [] as string[],
  deleteError: undefined as Error | undefined,
}));

// Popups, portals and focus traps need a browser window. The popup's content is rendered in
// place so the menu and dialog can be driven; the positioning itself is not under test.
vi.mock('folds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('folds')>()),
  PopOut: ({ content }: { content: React.ReactNode }) => <div>{content}</div>,
  Overlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OverlayCenter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OverlayBackdrop: () => null,
}));
vi.mock('focus-trap-react', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../src/app/hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({ getSafeUserId: () => '@me:x', getDeviceId: () => 'DEV1' }),
}));
vi.mock('../../src/app/hooks/useKeyBackup', () => ({
  useKeyBackupStatus: () => true,
  useKeyBackupInfo: () => state.info,
  useKeyBackupSync: () => [0, undefined],
  notifyKeyBackupInfoChanged: vi.fn(),
  useKeyBackupTrust: () => ({ trusted: true, matchesDecryptionKey: state.matchesDecryptionKey }),
}));
vi.mock('../../src/app/hooks/useSecretStorage', () => ({
  useSecretStorageDefaultKeyId: () => state.keyId,
  useSecretStorageKeyContent: () => (state.keyId ? {} : undefined),
}));
vi.mock('../../src/app/components/ManualVerification', () => ({
  ManualVerificationTile: ({ title }: { title: string }) => <div>{`unlock-form:${title}`}</div>,
}));
vi.mock('../../src/app/components/info-card', () => ({
  InfoCard: ({
    title,
    after,
    children,
  }: {
    title: React.ReactNode;
    after: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <section>
      <h3>{title}</h3>
      {after}
      {children}
    </section>
  ),
}));

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

describe('BackupRestoreTile', () => {
  let r: ReactTestRenderer;
  const crypto = () =>
    ({
      restoreKeyBackup: vi.fn(() => state.restore()),
      getActiveSessionBackupVersion: async () => String(state.version),
      getKeyBackupInfo: async () => ({ version: String(state.version) }),
      resetKeyBackup: vi.fn(async () => {
        state.resetCalls += 1;
      }),
      deleteKeyBackupVersion: vi.fn(async (version: string) => {
        if (state.deleteError) throw state.deleteError;
        state.deleteCalls.push(version);
      }),
    }) as never;
  const mount = async () => {
    await act(async () => {
      r = create(<BackupRestoreTile crypto={crypto()} />);
    });
  };
  const button = (label: string) =>
    r.root.findAll((n) => n.type === 'button' && textOf(n).includes(label))[0];
  const all = () => textOf(r.root);
  // The menu item 'Turn off backup...' also contains 'Turn off backup', so match exactly.
  const exact = (label: string) =>
    r.root.findAll((n) => n.type === 'button' && textOf(n) === label)[0];

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    state.version += 1;
    state.info = { version: String(state.version), count: 2 };
    state.matchesDecryptionKey = true;
    state.keyId = 'KEY';
    state.restore = async () => ({ total: 2, imported: 2 });
    state.resetCalls = 0;
    state.deleteCalls = [];
    state.deleteError = undefined;
  });
  afterEach(() => act(() => r.unmount()));

  it('offers Restore, with the reason, when the device can open a backup it has not restored', async () => {
    await mount();
    expect(all()).toContain('Your backup has 2 message keys this device has not restored');
    expect(button('Restore older messages')).toBeDefined();
  });

  it('uses the singular for one key', async () => {
    state.info = { version: String(state.version), count: 1 };
    await mount();
    expect(all()).toContain('1 message key this device');
  });

  it('shows no Restore button once it has been restored', async () => {
    await mount();
    await act(async () => button('Restore older messages').props.onClick());
    expect(isBackupRestored('@me:x', 'DEV1', String(state.version))).toBe(true);
    expect(button('Restore older messages')).toBeUndefined();
  });

  it('says how many keys were restored', async () => {
    await mount();
    await act(async () => button('Restore older messages').props.onClick());
    expect(all()).toContain('Restored 2 message keys');
  });

  it('says so when there was nothing new to restore', async () => {
    state.restore = async () => ({ total: 2, imported: 0 });
    await mount();
    await act(async () => button('Restore older messages').props.onClick());
    expect(all()).toContain('Nothing new to restore');
  });

  it('keeps the button and shows the error when the restore fails', async () => {
    state.restore = async () => {
      throw new Error('Decryption key does not match');
    };
    await mount();
    await act(async () => button('Restore older messages').props.onClick());
    expect(all()).toContain('Decryption key does not match');
    expect(button('Restore older messages')).toBeDefined();
    expect(isBackupRestored('@me:x', 'DEV1', String(state.version))).toBe(false);
  });

  it('does not offer Restore when this device cannot open the backup, and offers the key instead', async () => {
    state.matchesDecryptionKey = false;
    await mount();
    expect(button('Restore older messages')).toBeUndefined();
    expect(all()).toContain('cannot open your backup yet');

    await act(async () => button('Enter recovery key').props.onClick());
    expect(all()).toContain('unlock-form:Unlock backup');
  });

  it('points to another device when there is no recovery key to enter', async () => {
    state.matchesDecryptionKey = false;
    state.keyId = undefined;
    await mount();
    expect(button('Enter recovery key')).toBeUndefined();
    expect(all()).toContain('another device that is signed in');
  });

  it('shows no button for an empty backup', async () => {
    state.info = { version: String(state.version), count: 0 };
    await mount();
    expect(button('Restore older messages')).toBeUndefined();
  });

  it('says there is no backup when the server has none', async () => {
    state.info = null;
    await mount();
    expect(all()).toContain('no backup on the server');
    expect(button('Restore older messages')).toBeUndefined();
  });

  it('shows nothing extra while the backup info loads', async () => {
    state.info = undefined;
    await mount();
    expect(button('Restore older messages')).toBeUndefined();
    expect(all()).not.toContain('no backup on the server');
  });

  describe('turning the server backup off and on', () => {
    it('offers Turn off backup in the menu when a backup exists', async () => {
      await mount();
      expect(button('Turn off backup...')).toBeDefined();
    });

    it('asks first, and deletes nothing until it is confirmed', async () => {
      await mount();
      await act(async () => button('Turn off backup...').props.onClick());
      expect(all()).toContain('Turn off server backup?');
      expect(all()).toContain('for all your devices');
      expect(all()).toContain('cannot be brought back');
      expect(state.deleteCalls).toEqual([]);
    });

    it('deletes the current backup version once confirmed, then closes', async () => {
      await mount();
      await act(async () => button('Turn off backup...').props.onClick());
      await act(async () => exact('Turn off backup').props.onClick());
      expect(state.deleteCalls).toEqual([String(state.version)]);
      expect(all()).not.toContain('Turn off server backup?');
    });

    it('deletes nothing when cancelled', async () => {
      await mount();
      await act(async () => button('Turn off backup...').props.onClick());
      await act(async () => button('Cancel').props.onClick());
      expect(state.deleteCalls).toEqual([]);
      expect(all()).not.toContain('Turn off server backup?');
    });

    it('keeps the dialog open and shows the reason when deleting fails', async () => {
      state.deleteError = new Error('Server said no');
      await mount();
      await act(async () => button('Turn off backup...').props.onClick());
      await act(async () => exact('Turn off backup').props.onClick());
      expect(all()).toContain('Server said no');
      expect(all()).toContain('Turn off server backup?');
    });

    it('offers no Turn off when there is no backup, and offers Turn on instead', async () => {
      state.info = null;
      await mount();
      expect(button('Turn off backup...')).toBeUndefined();
      expect(button('Turn on backup')).toBeDefined();
      expect(all()).toContain('Its admin cannot read it, but could add keys to it');
      expect(all()).toContain('forged messages could appear');
    });

    it('creates a new backup when Turn on is pressed', async () => {
      state.info = null;
      await mount();
      await act(async () => button('Turn on backup').props.onClick());
      expect(state.resetCalls).toBe(1);
    });

    it('does not offer Turn on while a backup exists', async () => {
      await mount();
      expect(button('Turn on backup')).toBeUndefined();
    });
  });
});

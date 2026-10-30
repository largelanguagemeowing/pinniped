import React from 'react';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogoutDialog } from '../../src/app/components/LogoutDialog';
import { VerificationStatus } from '../../src/app/hooks/useDeviceVerificationStatus';

const state = vi.hoisted(() => ({
  encryptedRooms: true,
  crossSigningActive: true,
  verification: 2 as number, // VerificationStatus.Verified
  backupActive: true,
  backupRemaining: 0,
  devices: [{ device_id: 'THIS' }, { device_id: 'OTHER' }] as { device_id: string }[] | undefined,
  logoutClient: vi.fn(),
}));

vi.mock('../../src/client/initMatrix', () => ({ logoutClient: state.logoutClient }));
vi.mock('../../src/app/hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    getCrypto: () => ({}),
    getDeviceId: () => 'THIS',
    getSafeUserId: () => '@me:x',
    getRooms: () => [{ hasEncryptionStateEvent: () => state.encryptedRooms }],
  }),
}));
vi.mock('../../src/app/hooks/useCrossSigning', () => ({
  useCrossSigningActive: () => state.crossSigningActive,
}));
vi.mock('../../src/app/hooks/useDeviceVerificationStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/hooks/useDeviceVerificationStatus')>()),
  useDeviceVerificationStatus: () => state.verification,
}));
vi.mock('../../src/app/hooks/useKeyBackup', () => ({
  useKeyBackupStatus: () => state.backupActive,
  useKeyBackupSync: () => [state.backupRemaining, undefined],
}));
vi.mock('../../src/app/hooks/useDeviceList', () => ({
  useDeviceList: () => [state.devices],
}));
vi.mock('../../src/app/components/info-card', () => ({
  InfoCard: ({ variant, title }: { variant: string; title: string }) => (
    <section data-variant={variant}>{title}</section>
  ),
}));

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

describe('LogoutDialog', () => {
  let r: ReactTestRenderer;
  const mount = () => {
    act(() => {
      r = create(<LogoutDialog handleClose={vi.fn()} />);
    });
  };
  const cards = () =>
    r.root.findAll((n) => n.type === 'section').map((n) => [n.props['data-variant'], textOf(n)]);

  beforeEach(() => {
    state.encryptedRooms = true;
    state.crossSigningActive = true;
    state.verification = VerificationStatus.Verified;
    state.backupActive = true;
    state.backupRemaining = 0;
    state.devices = [{ device_id: 'THIS' }, { device_id: 'OTHER' }];
    state.logoutClient.mockReset();
  });
  afterEach(() => act(() => r.unmount()));

  it('shows no warning when keys are safe and another device exists', () => {
    mount();
    expect(cards()).toEqual([]);
  });

  it('shows no warning without encrypted rooms, even for the only device', () => {
    state.encryptedRooms = false;
    state.backupActive = false;
    state.devices = [{ device_id: 'THIS' }];
    mount();
    expect(cards()).toEqual([]);
  });

  it('warns that keys are not backed up', () => {
    state.backupActive = false;
    mount();
    expect(cards()).toEqual([['Critical', 'Your message keys are not backed up']]);
  });

  it('warns while the backup is still running', () => {
    state.backupRemaining = 4;
    mount();
    expect(cards()).toEqual([['Warning', 'Backup is still running']]);
  });

  it('adds a warning when this is the only device', () => {
    state.devices = [{ device_id: 'THIS' }];
    mount();
    expect(cards()).toEqual([['Warning', 'This is your only signed-in device']]);
  });

  it('makes the only-device card critical when keys are also at risk', () => {
    state.backupActive = false;
    state.devices = [{ device_id: 'THIS' }];
    mount();
    expect(cards()).toEqual([
      ['Critical', 'Your message keys are not backed up'],
      ['Critical', 'This is your only signed-in device'],
    ]);
  });

  it('does not call this the only device until the device list has loaded', () => {
    state.devices = undefined;
    mount();
    expect(cards()).toEqual([]);
  });

  it('still logs out when Logout is pressed', () => {
    mount();
    const button = r.root.findAll((n) => n.type === 'button' && textOf(n) === 'Logout')[0];
    act(() => button.props.onClick());
    expect(state.logoutClient).toHaveBeenCalledTimes(1);
  });
});

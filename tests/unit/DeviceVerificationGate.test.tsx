import React from 'react';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceVerificationGate } from '../../src/app/features/device-verification-gate/DeviceVerificationGate';
import { VerificationStatus } from '../../src/app/hooks/useDeviceVerificationStatus';

const state = vi.hoisted(() => ({
  crossSigningActive: true,
  status: 2 as number, // set per test; 1 = VerificationStatus.Unverified
  keyId: 'KEY' as string | undefined,
  keyContent: {} as object | undefined,
}));

vi.mock('../../src/app/hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    getSafeUserId: () => '@me:x',
    getDeviceId: () => 'DEV1',
    getCrypto: () => ({}),
  }),
}));
vi.mock('../../src/app/hooks/useCrossSigning', () => ({
  useCrossSigningActive: () => state.crossSigningActive,
}));
vi.mock('../../src/app/hooks/useDeviceVerificationStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/hooks/useDeviceVerificationStatus')>()),
  useDeviceVerificationStatus: () => state.status,
}));
vi.mock('../../src/app/hooks/useSecretStorage', () => ({
  useSecretStorageDefaultKeyId: () => state.keyId,
  useSecretStorageKeyContent: () => state.keyContent,
}));
vi.mock('../../src/app/hooks/useVerifyWithRecoveryKey', () => ({
  useVerifyWithRecoveryKey: () => ({
    verifyState: { status: 'idle' },
    verify: vi.fn(),
    verifying: false,
  }),
}));
vi.mock('../../src/app/components/DeviceVerification', () => ({
  DeviceVerificationFlow: () => null,
  cancelVerificationRequest: vi.fn(),
}));
vi.mock('../../src/app/components/ManualVerification', () => ({
  ManualVerificationMethod: { RecoveryPassphrase: 'passphrase', RecoveryKey: 'key' },
  ManualVerificationMethodSwitcher: () => null,
}));
vi.mock('../../src/app/components/SecretStorage', () => ({
  SecretStorageRecoveryKey: () => null,
  SecretStorageRecoveryPassphrase: () => null,
}));
// The shell only frames the content; its styles and logo need the bundler.
vi.mock('../../src/app/pages/auth/AuthShell', () => ({
  AuthShell: ({ aside, children }: { aside: React.ReactNode; children: React.ReactNode }) => (
    <div>
      {children}
      {aside}
    </div>
  ),
}));
vi.mock('../../src/app/pages/auth/AuthAside', () => ({ AuthAside: () => null }));
vi.mock('../../src/app/pages/auth/styles.css', () => ({ AuthGate: 'gate' }));

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

const click = (r: ReactTestRenderer, label: string) => {
  const button = r.root.findAll((n) => n.type === 'button' && textOf(n).includes(label))[0];
  if (!button) throw new Error(`No button "${label}"`);
  act(() => button.props.onClick());
};

const rendered = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());

describe('DeviceVerificationGate', () => {
  let r: ReactTestRenderer;
  const mount = () => {
    act(() => {
      r = create(<DeviceVerificationGate />);
    });
  };

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    state.crossSigningActive = true;
    state.status = VerificationStatus.Unverified;
    state.keyId = 'KEY';
    state.keyContent = {};
  });
  afterEach(() => act(() => r.unmount()));

  it('asks an unverified device to verify', () => {
    mount();
    expect(rendered(r)).toContain('Verify this device');
    expect(rendered(r)).toContain('Verify with another device');
    expect(rendered(r)).toContain('Use recovery key or passphrase');
  });

  it('hides the recovery key option when the account has none', () => {
    state.keyId = undefined;
    state.keyContent = undefined;
    mount();
    expect(rendered(r)).not.toContain('Use recovery key or passphrase');
  });

  it('renders nothing without an encryption identity or while status is unknown', () => {
    state.crossSigningActive = false;
    mount();
    expect(r.toJSON()).toBeNull();
    act(() => r.unmount());
    state.crossSigningActive = true;
    state.status = VerificationStatus.Unknown;
    mount();
    expect(r.toJSON()).toBeNull();
  });

  it('lists what skipping costs, and remembers the choice on this device', () => {
    mount();
    click(r, 'Continue without verifying');
    expect(rendered(r)).toContain('Continue without verifying?');
    expect(rendered(r)).toContain('Older encrypted messages stay unreadable');

    click(r, 'Continue unverified');
    expect(r.toJSON()).toBeNull();
    expect(localStorage.getItem('verification_gate_dismissed:@me:x:DEV1')).toBe('1');

    // a new mount (next launch) stays out of the way
    act(() => r.unmount());
    mount();
    expect(r.toJSON()).toBeNull();
  });

  it('goes back from the skip screen to verification', () => {
    mount();
    click(r, 'Continue without verifying');
    click(r, 'Go back and verify');
    expect(rendered(r)).toContain('Verify this device');
  });

  it('confirms once verification completes, then closes', () => {
    mount();
    state.status = VerificationStatus.Verified;
    act(() => r.update(<DeviceVerificationGate />));
    expect(rendered(r)).toContain('This device is verified');

    click(r, 'Continue to Pinniped');
    expect(r.toJSON()).toBeNull();
  });

  it('does not celebrate a device that was already verified at launch', () => {
    state.status = VerificationStatus.Verified;
    mount();
    expect(r.toJSON()).toBeNull();
  });
});

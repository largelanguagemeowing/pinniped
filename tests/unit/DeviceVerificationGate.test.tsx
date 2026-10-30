import React from 'react';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceVerificationGate } from '../../src/app/features/device-verification-gate/DeviceVerificationGate';
import {
  isGateDismissed,
  reopenGate,
} from '../../src/app/features/device-verification-gate/deviceVerificationGate';
import { VerificationStatus } from '../../src/app/hooks/useDeviceVerificationStatus';

const state = vi.hoisted(() => ({
  crossSigningActive: true,
  status: 1 as number, // VerificationStatus.Unverified
  // what the server says when the keys are not in secret storage; 'fail' rejects the lookup
  keysOnServer: true as boolean | 'fail',
  keyId: 'KEY' as string | undefined,
  keyContent: {} as object | undefined,
}));

vi.mock('../../src/app/hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    getSafeUserId: () => '@me:x',
    getDeviceId: () => 'DEV1',
    getCrypto: () => ({
      userHasCrossSigningKeys: () =>
        state.keysOnServer === 'fail'
          ? Promise.reject(new Error('offline'))
          : Promise.resolve(state.keysOnServer),
    }),
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
vi.mock('../../src/app/components/DeviceVerificationSetup', () => ({
  DeviceVerificationResetOverlay: ({ onCancel }: { onCancel: () => void }) => (
    <button type="button" onClick={onCancel}>
      reset-dialog
    </button>
  ),
  SetupVerification: ({ onComplete }: { onComplete: (key: string) => void }) => (
    <button type="button" onClick={() => onComplete('EsTc 1abc')}>
      create-key
    </button>
  ),
  RecoveryKeyDisplay: ({ recoveryKey, onDone }: { recoveryKey: string; onDone: () => void }) => (
    <div>
      {`key-on-screen:${recoveryKey}`}
      <button type="button" onClick={onDone}>
        key-saved
      </button>
    </div>
  ),
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
  // The identity lookup is asynchronous, so let it settle before looking.
  const mount = async () => {
    await act(async () => {
      r = create(<DeviceVerificationGate />);
    });
  };
  const rerender = async () => {
    await act(async () => {
      r.update(<DeviceVerificationGate />);
    });
  };

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    reopenGate('verify', '@me:x', 'DEV1');
    reopenGate('setup', '@me:x', 'DEV1');
    state.crossSigningActive = true;
    state.status = VerificationStatus.Unverified;
    state.keysOnServer = true;
    state.keyId = 'KEY';
    state.keyContent = {};
  });
  afterEach(() => {
    act(() => r.unmount());
    vi.restoreAllMocks();
  });

  describe('verifying', () => {
    it('asks an unverified device to verify', async () => {
      await mount();
      expect(rendered(r)).toContain('Verify this device');
      expect(rendered(r)).toContain('Verify with another device');
      expect(rendered(r)).toContain('Use recovery key or passphrase');
    });

    it('hides the recovery key option when the account has none', async () => {
      state.keyId = undefined;
      state.keyContent = undefined;
      await mount();
      expect(rendered(r)).not.toContain('Use recovery key or passphrase');
    });

    it('still asks to verify when the identity exists but is not in secret storage', async () => {
      state.crossSigningActive = false;
      state.keysOnServer = true;
      state.keyId = undefined;
      state.keyContent = undefined;
      await mount();
      expect(rendered(r)).toContain('Verify this device');
      expect(rendered(r)).toContain('Verify with another device');
      expect(rendered(r)).not.toContain('Use recovery key or passphrase');
    });

    it('renders nothing while the device status is unknown', async () => {
      state.status = VerificationStatus.Unknown;
      await mount();
      expect(r.toJSON()).toBeNull();
    });

    it('lists what skipping costs, and remembers the choice on this device', async () => {
      await mount();
      click(r, 'Continue without verifying');
      expect(rendered(r)).toContain('Continue without verifying?');
      expect(rendered(r)).toContain('Older encrypted messages stay unreadable');

      click(r, 'Continue unverified');
      expect(r.toJSON()).toBeNull();
      expect(isGateDismissed('verify', '@me:x', 'DEV1')).toBe(true);

      // a new mount (next launch) stays out of the way
      act(() => r.unmount());
      await mount();
      expect(r.toJSON()).toBeNull();
    });

    it('offers a way out when the recovery key is lost, and returns from it', async () => {
      await mount();
      click(r, 'Use recovery key or passphrase');
      expect(rendered(r)).toContain('Enter your recovery key');
      expect(rendered(r)).not.toContain('reset-dialog');

      click(r, 'Lost your recovery key?');
      expect(rendered(r)).toContain('reset-dialog');

      click(r, 'reset-dialog');
      expect(rendered(r)).not.toContain('reset-dialog');
      expect(rendered(r)).toContain('Enter your recovery key');
    });

    it('goes back from the skip screen to verification', async () => {
      await mount();
      click(r, 'Continue without verifying');
      click(r, 'Go back and verify');
      expect(rendered(r)).toContain('Verify this device');
    });

    it('confirms once verification completes, then closes', async () => {
      await mount();
      state.status = VerificationStatus.Verified;
      await rerender();
      expect(rendered(r)).toContain('This device is verified');

      click(r, 'Continue to Pinniped');
      expect(r.toJSON()).toBeNull();
    });

    it('does not celebrate a device that was already verified at launch', async () => {
      state.status = VerificationStatus.Verified;
      await mount();
      expect(r.toJSON()).toBeNull();
    });
  });

  describe('setting up recovery', () => {
    beforeEach(() => {
      state.crossSigningActive = false;
      state.keysOnServer = false;
      state.keyId = undefined;
      state.keyContent = undefined;
    });

    it('asks an account with no encryption identity to set up recovery', async () => {
      await mount();
      expect(rendered(r)).toContain('Secure your messages');
      expect(rendered(r)).toContain('create-key');
      expect(rendered(r)).not.toContain('Verify this device');
    });

    it('asks nothing if the identity lookup fails', async () => {
      state.keysOnServer = 'fail';
      await mount();
      expect(r.toJSON()).toBeNull();
    });

    it('never offers setup when the server says an identity exists', async () => {
      state.keysOnServer = true;
      await mount();
      expect(rendered(r)).not.toContain('Secure your messages');
    });

    it('keeps the new key on screen until it is saved, even after setup succeeds', async () => {
      await mount();
      click(r, 'create-key');
      expect(rendered(r)).toContain('Save your recovery key');
      expect(rendered(r)).toContain('key-on-screen:EsTc 1abc');

      // creating the keys makes the account verified and the identity present
      state.crossSigningActive = true;
      state.status = VerificationStatus.Verified;
      await rerender();
      expect(rendered(r)).toContain('key-on-screen:EsTc 1abc');

      click(r, 'key-saved');
      expect(r.toJSON()).toBeNull();
    });

    it('stays on setup through the half-verified moment while the keys are created', async () => {
      await mount();
      expect(rendered(r)).toContain('Secure your messages');

      // identity now present, device not yet signed: gateKind alone would ask to verify
      state.crossSigningActive = true;
      await rerender();
      expect(rendered(r)).toContain('Secure your messages');
      expect(rendered(r)).not.toContain('Verify this device');

      state.status = VerificationStatus.Verified;
      await rerender();
      click(r, 'create-key');
      click(r, 'key-saved');

      // saving the key is the end: no second confirmation, and nothing left to ask
      expect(r.toJSON()).toBeNull();
    });

    it('lists what skipping costs, remembered separately from verification', async () => {
      await mount();
      click(r, 'Continue without recovery');
      expect(rendered(r)).toContain('Continue without recovery?');
      expect(rendered(r)).toContain('cannot be restored');

      click(r, 'Continue without recovery');
      expect(r.toJSON()).toBeNull();
      expect(isGateDismissed('setup', '@me:x', 'DEV1')).toBe(true);
      expect(isGateDismissed('verify', '@me:x', 'DEV1')).toBe(false);
    });

    it('goes back from the skip screen to setup', async () => {
      await mount();
      click(r, 'Continue without recovery');
      click(r, 'Go back and set up');
      expect(rendered(r)).toContain('Secure your messages');
    });
  });
});

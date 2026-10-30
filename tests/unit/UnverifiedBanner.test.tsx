import React from 'react';
import { act, create, ReactTestRenderer, ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnverifiedBanner } from '../../src/app/features/device-verification-gate/UnverifiedBanner';
import {
  dismissGate,
  isGateDismissed,
  reopenGate,
} from '../../src/app/features/device-verification-gate/deviceVerificationGate';
import { VerificationStatus } from '../../src/app/hooks/useDeviceVerificationStatus';

const state = vi.hoisted(() => ({
  crossSigningActive: true,
  status: 1 as number, // VerificationStatus.Unverified
  keysOnServer: true,
}));

vi.mock('../../src/app/hooks/useMatrixClient', () => ({
  useMatrixClient: () => ({
    getSafeUserId: () => '@me:x',
    getDeviceId: () => 'DEV1',
    getCrypto: () => ({ userHasCrossSigningKeys: () => Promise.resolve(state.keysOnServer) }),
  }),
}));
vi.mock('../../src/app/hooks/useCrossSigning', () => ({
  useCrossSigningActive: () => state.crossSigningActive,
}));
vi.mock('../../src/app/hooks/useDeviceVerificationStatus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/hooks/useDeviceVerificationStatus')>()),
  useDeviceVerificationStatus: () => state.status,
}));
vi.mock('../../src/app/features/device-verification-gate/UnverifiedBanner.css', () => ({
  UnverifiedBanner: 'banner',
}));

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

describe('UnverifiedBanner', () => {
  let r: ReactTestRenderer;
  const mount = async () => {
    await act(async () => {
      r = create(<UnverifiedBanner />);
    });
  };
  const button = (label: string) =>
    r.root.findAll((n) => n.type === 'button' && textOf(n).includes(label))[0];

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    reopenGate('verify', '@me:x', 'DEV1');
    reopenGate('setup', '@me:x', 'DEV1');
    state.crossSigningActive = true;
    state.status = VerificationStatus.Unverified;
    state.keysOnServer = true;
  });
  afterEach(() => act(() => r.unmount()));

  describe('after skipping verification', () => {
    it('shows on a still-unverified device', async () => {
      dismissGate('verify', '@me:x', 'DEV1');
      await mount();
      expect(textOf(r.root)).toContain('This device is unverified.');
    });

    it('stays hidden while the gate itself is open', async () => {
      await mount();
      expect(r.toJSON()).toBeNull();
    });

    it.each([VerificationStatus.Verified, VerificationStatus.Unknown])(
      'stays hidden when the status is %s',
      async (status) => {
        dismissGate('verify', '@me:x', 'DEV1');
        state.status = status;
        await mount();
        expect(r.toJSON()).toBeNull();
      }
    );

    it('brings the gate back with Verify now, and hides itself', async () => {
      dismissGate('verify', '@me:x', 'DEV1');
      await mount();
      await act(async () => button('Verify now').props.onClick());

      expect(isGateDismissed('verify', '@me:x', 'DEV1')).toBe(false);
      expect(r.toJSON()).toBeNull();
    });
  });

  describe('after skipping setup', () => {
    beforeEach(() => {
      state.crossSigningActive = false;
      state.keysOnServer = false;
    });

    it('says recovery is not set up, with its own action', async () => {
      dismissGate('setup', '@me:x', 'DEV1');
      await mount();
      expect(textOf(r.root)).toContain('Recovery is not set up.');
      expect(textOf(r.root)).toContain('cannot be restored');
      expect(button('Set up now')).toBeDefined();
    });

    it('does not show for a skipped verification, which is a different question', async () => {
      dismissGate('verify', '@me:x', 'DEV1');
      await mount();
      expect(r.toJSON()).toBeNull();
    });

    it('brings the setup gate back with Set up now', async () => {
      dismissGate('setup', '@me:x', 'DEV1');
      await mount();
      await act(async () => button('Set up now').props.onClick());

      expect(isGateDismissed('setup', '@me:x', 'DEV1')).toBe(false);
      expect(r.toJSON()).toBeNull();
    });
  });
});

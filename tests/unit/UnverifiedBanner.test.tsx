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

const state = vi.hoisted(() => ({ crossSigningActive: true, status: 1 as number }));

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
vi.mock('../../src/app/features/device-verification-gate/UnverifiedBanner.css', () => ({
  UnverifiedBanner: 'banner',
}));

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

describe('UnverifiedBanner', () => {
  let r: ReactTestRenderer;
  const mount = () => {
    act(() => {
      r = create(<UnverifiedBanner />);
    });
  };

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    reopenGate('@me:x', 'DEV1');
    state.crossSigningActive = true;
    state.status = VerificationStatus.Unverified;
  });
  afterEach(() => act(() => r.unmount()));

  it('shows after the gate was skipped on a still-unverified device', () => {
    dismissGate('@me:x', 'DEV1');
    mount();
    expect(textOf(r.root)).toContain('This device is unverified.');
  });

  it('stays hidden while the gate itself is open', () => {
    mount();
    expect(r.toJSON()).toBeNull();
  });

  it.each([VerificationStatus.Verified, VerificationStatus.Unknown])(
    'stays hidden when the status is %s',
    (status) => {
      dismissGate('@me:x', 'DEV1');
      state.status = status;
      mount();
      expect(r.toJSON()).toBeNull();
    }
  );

  it('stays hidden when the account has no encryption identity', () => {
    dismissGate('@me:x', 'DEV1');
    state.crossSigningActive = false;
    mount();
    expect(r.toJSON()).toBeNull();
  });

  it('brings the gate back with Verify now, and hides itself', () => {
    dismissGate('@me:x', 'DEV1');
    mount();
    const button = r.root.findAll(
      (n) => n.type === 'button' && textOf(n).includes('Verify now')
    )[0];
    act(() => button.props.onClick());

    expect(isGateDismissed('@me:x', 'DEV1')).toBe(false);
    expect(r.toJSON()).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dismissGate,
  gateKind,
  GateState,
  isGateDismissed,
  justVerified,
  pendingKind,
  reopenGate,
  shouldShowGate,
  subscribeGateDismissal,
} from '../../src/app/features/device-verification-gate/deviceVerificationGate';
import { VerificationStatus } from '../../src/app/hooks/useDeviceVerificationStatus';

const base: GateState = {
  identity: 'present',
  status: VerificationStatus.Unverified,
  dismissed: { verify: false, setup: false },
  finished: false,
};

describe('gateKind', () => {
  it('asks to verify an unverified device on an account with an identity', () => {
    expect(gateKind(base)).toBe('verify');
  });

  it('asks to set up when the account has no identity at all', () => {
    expect(gateKind({ ...base, identity: 'absent' })).toBe('setup');
  });

  it('never offers setup while the identity is unknown, so it cannot replace one', () => {
    expect(gateKind({ ...base, identity: 'unknown' })).toBeNull();
  });

  it.each([
    VerificationStatus.Unknown,
    VerificationStatus.Verified,
    VerificationStatus.Unsupported,
  ])('asks nothing when the device status is %s', (status) => {
    expect(gateKind({ ...base, status })).toBeNull();
    expect(gateKind({ ...base, status, identity: 'absent' })).toBeNull();
  });

  it('treats each kind of dismissal separately', () => {
    const verifyDismissed = { verify: true, setup: false };
    const setupDismissed = { verify: false, setup: true };
    expect(gateKind({ ...base, dismissed: verifyDismissed })).toBeNull();
    expect(gateKind({ ...base, identity: 'absent', dismissed: verifyDismissed })).toBe('setup');
    expect(gateKind({ ...base, identity: 'absent', dismissed: setupDismissed })).toBeNull();
    expect(gateKind({ ...base, dismissed: setupDismissed })).toBe('verify');
  });
});

describe('pendingKind', () => {
  it('names what a skipped gate would still ask for', () => {
    expect(pendingKind({ identity: 'present', status: VerificationStatus.Unverified })).toBe(
      'verify'
    );
    expect(pendingKind({ identity: 'absent', status: VerificationStatus.Unverified })).toBe(
      'setup'
    );
    expect(pendingKind({ identity: 'present', status: VerificationStatus.Verified })).toBeNull();
  });
});

describe('shouldShowGate', () => {
  it('shows while something is asked, or while the confirmation is pending', () => {
    expect(shouldShowGate(base)).toBe(true);
    expect(shouldShowGate({ ...base, identity: 'absent' })).toBe(true);
    const verified = { ...base, status: VerificationStatus.Verified };
    expect(shouldShowGate(verified)).toBe(false);
    expect(shouldShowGate({ ...verified, finished: true })).toBe(true);
  });
});

describe('justVerified', () => {
  const verified = { ...base, status: VerificationStatus.Verified };

  it('only celebrates a device that was verified through the gate', () => {
    expect(justVerified(true, verified)).toBe(true);
    expect(justVerified(false, verified)).toBe(false);
    // verified later from the banner or settings after choosing to skip
    expect(justVerified(true, { ...verified, dismissed: { verify: true, setup: false } })).toBe(
      false
    );
  });
});

describe('gate dismissal', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
  });

  it('is remembered per kind, user and device', () => {
    dismissGate('verify', '@a:x', 'DEV1');
    expect(isGateDismissed('verify', '@a:x', 'DEV1')).toBe(true);
    expect(isGateDismissed('setup', '@a:x', 'DEV1')).toBe(false);
    expect(isGateDismissed('verify', '@a:x', 'DEV2')).toBe(false);
    expect(isGateDismissed('verify', '@b:x', 'DEV1')).toBe(false);
  });

  it('can be reopened from the banner, and tells subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGateDismissal(listener);

    dismissGate('setup', '@a:x', 'DEV3');
    reopenGate('setup', '@a:x', 'DEV3');
    expect(isGateDismissed('setup', '@a:x', 'DEV3')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    dismissGate('setup', '@a:x', 'DEV3');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps the choice for the session when storage is blocked', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
    dismissGate('verify', '@a:x', 'DEV4');
    expect(isGateDismissed('verify', '@a:x', 'DEV4')).toBe(true);
    reopenGate('verify', '@a:x', 'DEV4');
    expect(isGateDismissed('verify', '@a:x', 'DEV4')).toBe(false);
  });
});

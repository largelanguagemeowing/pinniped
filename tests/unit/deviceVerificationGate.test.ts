import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dismissGate,
  reopenGate,
  subscribeGateDismissal,
  gateNeedsVerification,
  isGateDismissed,
  justVerified,
  shouldShowGate,
} from '../../src/app/features/device-verification-gate/deviceVerificationGate';
import { VerificationStatus } from '../../src/app/hooks/useDeviceVerificationStatus';

const base = {
  crossSigningActive: true,
  status: VerificationStatus.Unverified,
  dismissed: false,
  finished: false,
};

describe('device verification gate', () => {
  it('asks an unverified device on an account with an encryption identity', () => {
    expect(shouldShowGate(base)).toBe(true);
  });

  it('stays out of the way until the status is known', () => {
    expect(shouldShowGate({ ...base, status: VerificationStatus.Unknown })).toBe(false);
  });

  it.each([VerificationStatus.Verified, VerificationStatus.Unsupported])(
    'does not ask when the status is %s',
    (status) => {
      expect(shouldShowGate({ ...base, status })).toBe(false);
    }
  );

  it('does not ask when the account has no encryption identity yet', () => {
    expect(shouldShowGate({ ...base, crossSigningActive: false })).toBe(false);
  });

  it('does not ask again once dismissed', () => {
    expect(shouldShowGate({ ...base, dismissed: true })).toBe(false);
  });

  it('keeps showing the confirmation after verification completes', () => {
    const verified = { ...base, status: VerificationStatus.Verified };
    expect(gateNeedsVerification(verified)).toBe(false);
    expect(shouldShowGate({ ...verified, finished: true })).toBe(true);
  });

  it('only celebrates a device that was verified through the gate', () => {
    const verified = { ...base, status: VerificationStatus.Verified };
    expect(justVerified(true, verified)).toBe(true);
    expect(justVerified(false, verified)).toBe(false);
    // verified later from the banner or settings after choosing to skip
    expect(justVerified(true, { ...verified, dismissed: true })).toBe(false);
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

  it('is remembered per user and device', () => {
    dismissGate('@a:x', 'DEV1');
    expect(isGateDismissed('@a:x', 'DEV1')).toBe(true);
    expect(isGateDismissed('@a:x', 'DEV2')).toBe(false);
    expect(isGateDismissed('@b:x', 'DEV1')).toBe(false);
  });

  it('can be reopened from the banner, and tells subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGateDismissal(listener);

    dismissGate('@a:x', 'DEV3');
    reopenGate('@a:x', 'DEV3');
    expect(isGateDismissed('@a:x', 'DEV3')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    dismissGate('@a:x', 'DEV3');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps the choice for the session when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    dismissGate('@a:x', 'DEV4');
    expect(isGateDismissed('@a:x', 'DEV4')).toBe(true);
    reopenGate('@a:x', 'DEV4');
    expect(isGateDismissed('@a:x', 'DEV4')).toBe(false);
  });
});

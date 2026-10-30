import { VerificationStatus } from '../../hooks/useDeviceVerificationStatus';

export type GateState = {
  crossSigningActive: boolean;
  status: VerificationStatus;
  /** The person chose "Continue without verifying" on this device. */
  dismissed: boolean;
  /** The gate was showing and verification just completed, so show the confirmation. */
  finished: boolean;
};

/**
 * The gate asks for verification only when the account has an encryption identity to verify
 * against and this device is not yet trusted. Once dismissed it stays out of the way and the
 * banner takes over, so it never reappears on every launch.
 */
export const gateNeedsVerification = ({
  crossSigningActive,
  status,
  dismissed,
}: Omit<GateState, 'finished'>): boolean =>
  crossSigningActive && status === VerificationStatus.Unverified && !dismissed;

export const shouldShowGate = (state: GateState): boolean =>
  state.finished || gateNeedsVerification(state);

/** True when the gate was open for verification and the device has now become verified. */
export const justVerified = (wasNeeded: boolean, state: Omit<GateState, 'finished'>): boolean =>
  wasNeeded && !state.dismissed && state.status === VerificationStatus.Verified;

const dismissalKey = (userId: string, deviceId: string): string =>
  `verification_gate_dismissed:${userId}:${deviceId}`;

// The gate and the banner both read this, so it lives outside React. The in-memory copy keeps
// the choice for the session when storage is blocked.
const dismissed = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const subscribeGateDismissal = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const isGateDismissed = (userId: string, deviceId: string): boolean => {
  const key = dismissalKey(userId, deviceId);
  if (dismissed.has(key)) return true;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

export const dismissGate = (userId: string, deviceId: string): void => {
  const key = dismissalKey(userId, deviceId);
  dismissed.add(key);
  try {
    localStorage.setItem(key, '1');
  } catch {
    // The gate then shows again next launch, which is acceptable.
  }
  notify();
};

/** Brings the gate back, for the banner's "Verify now". */
export const reopenGate = (userId: string, deviceId: string): void => {
  const key = dismissalKey(userId, deviceId);
  dismissed.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing stored to clear.
  }
  notify();
};

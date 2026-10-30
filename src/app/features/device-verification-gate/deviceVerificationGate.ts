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

export const isGateDismissed = (userId: string, deviceId: string): boolean => {
  try {
    return localStorage.getItem(dismissalKey(userId, deviceId)) === '1';
  } catch {
    return false;
  }
};

export const dismissGate = (userId: string, deviceId: string): void => {
  try {
    localStorage.setItem(dismissalKey(userId, deviceId), '1');
  } catch {
    // Storage can be blocked; the gate then shows again next launch, which is acceptable.
  }
};

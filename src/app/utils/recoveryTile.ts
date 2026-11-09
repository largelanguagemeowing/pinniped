import type { IdentityState } from '../features/device-verification-gate/verificationGateLogic';

/**
 * What the recovery tile in Settings should offer:
 * - `setup`: the account has no encryption identity, so a full setup is right.
 * - `turnOn`: an identity exists but recovery is off. Recovery must be turned back on around the
 *   existing identity, never by creating a new one, which would unverify every device.
 * - `manage`: recovery is on.
 * - `checking`: not known yet, so offer nothing that could replace an identity.
 */
export type RecoveryTileState = 'checking' | 'setup' | 'turnOn' | 'manage';

export const recoveryTileState = (
  recoveryOn: boolean,
  identity: IdentityState
): RecoveryTileState => {
  if (recoveryOn) return 'manage';
  if (identity === 'unknown') return 'checking';
  return identity === 'absent' ? 'setup' : 'turnOn';
};

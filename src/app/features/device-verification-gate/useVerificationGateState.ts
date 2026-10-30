import { useSyncExternalStore } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useCrossSigningActive } from '../../hooks/useCrossSigning';
import { useDeviceVerificationStatus } from '../../hooks/useDeviceVerificationStatus';
import { isGateDismissed, subscribeGateDismissal } from './deviceVerificationGate';

/** What the gate and the banner both need to decide whether to show. */
export const useVerificationGateState = () => {
  const mx = useMatrixClient();
  const userId = mx.getSafeUserId();
  const deviceId = mx.getDeviceId() ?? undefined;

  const crossSigningActive = useCrossSigningActive();
  const status = useDeviceVerificationStatus(mx.getCrypto(), userId, deviceId);
  const dismissed = useSyncExternalStore(
    subscribeGateDismissal,
    () => !deviceId || isGateDismissed(userId, deviceId)
  );

  return { userId, deviceId, crossSigningActive, status, dismissed };
};

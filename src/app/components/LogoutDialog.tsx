import React, { forwardRef, useCallback } from 'react';
import { Dialog, Header, config, Box, Text, Button, Spinner, color } from 'folds';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { logoutClient } from '../../client/initMatrix';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useCrossSigningActive } from '../hooks/useCrossSigning';
import { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';
import { InfoCard } from './info-card';
import { useDeviceVerificationStatus } from '../hooks/useDeviceVerificationStatus';
import { useKeyBackupStatus, useKeyBackupSync } from '../hooks/useKeyBackup';
import { useDeviceList } from '../hooks/useDeviceList';
import { logoutRisks } from './logoutRisks';

/** What logging out would cost, as one card per risk. It only makes sense with encrypted rooms. */
function LogoutRiskCards({ crypto }: { crypto: CryptoApi }) {
  const mx = useMatrixClient();
  const deviceId = mx.getDeviceId() ?? undefined;

  const crossSigningActive = useCrossSigningActive();
  const verification = useDeviceVerificationStatus(crypto, mx.getSafeUserId(), deviceId);
  const backupActive = useKeyBackupStatus(crypto);
  const [backupRemaining] = useKeyBackupSync();
  const [devices] = useDeviceList();

  const risks = logoutRisks({
    crossSigningActive,
    verification,
    backupActive,
    backupRemaining,
    otherDevices: devices?.filter((device) => device.device_id !== deviceId).length,
  });

  return (
    <>
      {risks.map(({ id, severity, title, description }) => (
        <InfoCard key={id} variant={severity} title={title} description={description} />
      ))}
    </>
  );
}

type LogoutDialogProps = {
  handleClose: () => void;
};
export const LogoutDialog = forwardRef<HTMLDivElement, LogoutDialogProps>(
  ({ handleClose }, ref) => {
    const mx = useMatrixClient();
    const crypto = mx.getCrypto();
    const hasEncryptedRoom = !!mx.getRooms().find((room) => room.hasEncryptionStateEvent());

    const [logoutState, logout] = useAsyncCallback<void, Error, []>(
      useCallback(async () => {
        await logoutClient(mx);
      }, [mx])
    );

    const ongoingLogout = logoutState.status === AsyncStatus.Loading;

    return (
      <Dialog variant="Surface" ref={ref}>
        <Header
          style={{
            padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
            borderBottomWidth: config.borderWidth.B300,
          }}
          variant="Surface"
          size="500"
        >
          <Box grow="Yes">
            <Text size="H4">Logout</Text>
          </Box>
        </Header>
        <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
          {crypto && hasEncryptedRoom && <LogoutRiskCards crypto={crypto} />}
          <Text priority="400">You’re about to log out. Are you sure?</Text>
          {logoutState.status === AsyncStatus.Error && (
            <Text style={{ color: color.Critical.Main }} size="T300">
              Failed to logout! {logoutState.error.message}
            </Text>
          )}
          <Box direction="Column" gap="200">
            <Button
              variant="Critical"
              onClick={logout}
              disabled={ongoingLogout}
              before={ongoingLogout && <Spinner variant="Critical" fill="Solid" size="200" />}
            >
              <Text size="B400">Logout</Text>
            </Button>
            <Button variant="Secondary" fill="Soft" onClick={handleClose} disabled={ongoingLogout}>
              <Text size="B400">Cancel</Text>
            </Button>
          </Box>
        </Box>
      </Dialog>
    );
  }
);

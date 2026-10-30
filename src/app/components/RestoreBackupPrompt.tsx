import React, { useCallback } from 'react';
import { useSetAtom } from 'jotai';
import FocusTrap from 'focus-trap-react';
import { CryptoApi, KeyBackupRestoreResult } from 'matrix-js-sdk/lib/crypto-api';
import {
  Box,
  Button,
  Dialog,
  Header,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  color,
  config,
} from 'folds';
import { useMatrixClient } from '../hooks/useMatrixClient';
import { useBackupAdvice } from '../hooks/useBackupAdvice';
import { AsyncStatus, useAsyncCallback } from '../hooks/useAsyncCallback';
import { backupRestoreProgressAtom } from '../state/backupRestore';
import { declineBackupRestore, useBackupRestoreDeclined } from '../state/backupRestored';
import { restoreKeyBackupAndRecord } from '../utils/backupRestore';

function Prompt({ crypto }: { crypto: CryptoApi }) {
  const mx = useMatrixClient();
  const userId = mx.getSafeUserId();
  const deviceId = mx.getDeviceId() ?? undefined;

  const { info, advice } = useBackupAdvice(crypto);
  const declined = useBackupRestoreDeclined(userId, deviceId, info?.version);
  const setRestoreProgress = useSetAtom(backupRestoreProgressAtom);

  const [restoreState, restore] = useAsyncCallback<KeyBackupRestoreResult, Error, []>(
    useCallback(
      () => restoreKeyBackupAndRecord(crypto, userId, deviceId, setRestoreProgress),
      [crypto, userId, deviceId, setRestoreProgress]
    )
  );

  // Once restored the advice becomes 'ok', so the question closes itself.
  if (advice.kind !== 'restore' || declined || !info || !deviceId) return null;

  const busy = restoreState.status === AsyncStatus.Loading;

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: false,
            escapeDeactivates: false,
          }}
        >
          <Dialog variant="Surface">
            <Header
              style={{
                padding: `0 ${config.space.S400}`,
                borderBottomWidth: config.borderWidth.B300,
              }}
              variant="Surface"
              size="500"
            >
              <Box grow="Yes">
                <Text size="H4">Restore older messages?</Text>
              </Box>
            </Header>
            <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
              <Box direction="Column" gap="200">
                <Text size="T300">
                  Your homeserver has a backup of the keys for your older messages. Restoring it
                  lets you read them on this device.
                </Text>
                <Text size="T300">
                  The backup is stored on your homeserver. Its admin cannot read it, but could have
                  added keys to it, so forged messages could appear. Messages restored from it
                  cannot be checked, and show a grey shield.
                </Text>
                <Text size="T300" priority="300">
                  Prefer to trust only a file you saved yourself? Choose Not now, then import it
                  under Settings, Devices.
                </Text>
              </Box>
              {restoreState.status === AsyncStatus.Error && (
                <Text size="T300" style={{ color: color.Critical.Main }}>
                  <b>{restoreState.error.message}</b>
                </Text>
              )}
              <Box direction="Column" gap="200">
                <Button
                  variant="Primary"
                  disabled={busy}
                  before={busy && <Spinner size="200" variant="Primary" fill="Solid" />}
                  onClick={() => {
                    // The failure is shown above, so the rethrown rejection would only add noise.
                    restore().catch(() => undefined);
                  }}
                >
                  <Text as="span" size="B400">
                    Restore from backup
                  </Text>
                </Button>
                <Button
                  variant="Secondary"
                  fill="Soft"
                  disabled={busy}
                  onClick={() => declineBackupRestore(userId, deviceId, info.version)}
                >
                  <Text as="span" size="B400">
                    Not now
                  </Text>
                </Button>
              </Box>
            </Box>
          </Dialog>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

/**
 * Asks, instead of deciding for the person, whether to restore the server backup once this
 * device can open it. A restore is never run automatically: the keys in the backup cannot be
 * checked, so it is the person's call. "Not now" is remembered per device and backup, and the
 * restore row in Settings stays available.
 */
export function RestoreBackupPrompt() {
  const crypto = useMatrixClient().getCrypto();
  return crypto ? <Prompt crypto={crypto} /> : null;
}

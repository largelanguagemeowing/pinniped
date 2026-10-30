import { useCallback } from 'react';
import { useMatrixClient } from './useMatrixClient';
import { AsyncStatus, useAsyncCallback } from './useAsyncCallback';
import { storePrivateKey } from '../../client/secretStorageKeys';

/**
 * Verifies this device with a decoded recovery key: unlocks secret storage, signs this device
 * with the account's cross-signing keys and loads the key backup so old messages can be read.
 */
export const useVerifyWithRecoveryKey = (secretStorageKeyId: string) => {
  const mx = useMatrixClient();

  const verifyAndRestoreBackup = useCallback(
    async (recoveryKey: Uint8Array) => {
      const crypto = mx.getCrypto();
      if (!crypto) {
        throw new Error('Unexpected Error! Crypto object not found.');
      }

      storePrivateKey(secretStorageKeyId, recoveryKey);

      await crypto.bootstrapCrossSigning({});
      await crypto.bootstrapSecretStorage({});

      await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
    },
    [mx, secretStorageKeyId]
  );

  const [verifyState, verify] = useAsyncCallback<void, Error, [Uint8Array]>(verifyAndRestoreBackup);

  return { verifyState, verify, verifying: verifyState.status === AsyncStatus.Loading };
};

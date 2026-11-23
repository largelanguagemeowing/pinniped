import { ClientPrefix, MatrixClient, MatrixError, Method } from 'matrix-js-sdk';
import type { KeyBackupInfo } from 'matrix-js-sdk/lib/crypto-api';

// `CryptoApi.getKeyBackupInfo` returns null both when the server has no backup and when
// asking failed, so it cannot gate anything that deletes the backup. This separates them.
export type ServerBackup =
  | { status: 'absent' }
  | { status: 'present'; info: KeyBackupInfo }
  | { status: 'unknown'; error: unknown };

export const checkServerBackup = async (mx: MatrixClient): Promise<ServerBackup> => {
  try {
    const info = await mx.http.authedRequest<KeyBackupInfo>(
      Method.Get,
      '/room_keys/version',
      undefined,
      undefined,
      { prefix: ClientPrefix.V3 }
    );
    return { status: 'present', info };
  } catch (error) {
    if (error instanceof MatrixError && error.errcode === 'M_NOT_FOUND') {
      return { status: 'absent' };
    }
    return { status: 'unknown', error };
  }
};

// Creating a backup replaces whatever the server holds, so only an absent one is safe.
export const assertNoServerBackup = async (mx: MatrixClient): Promise<void> => {
  const backup = await checkServerBackup(mx);
  if (backup.status === 'present') {
    throw new Error(
      'A backup already exists on the server, so none was created. Reload to see it.'
    );
  }
  if (backup.status === 'unknown') {
    const reason = backup.error instanceof Error ? ` (${backup.error.message})` : '';
    throw new Error(
      `Could not check whether a backup already exists${reason}, so none was created. Try again.`
    );
  }
};

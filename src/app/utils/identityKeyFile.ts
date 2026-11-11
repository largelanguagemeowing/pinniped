import { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';

/** The SDK's secrets bundle, as `exportSecretsBundle` makes it and `importSecretsBundle` takes it. */
type IdentityBundle = Parameters<NonNullable<CryptoApi['importSecretsBundle']>>[0];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIdentityBundle = (value: unknown): value is IdentityBundle => {
  if (!isRecord(value) || !isRecord(value.cross_signing)) return false;
  const { cross_signing: keys, backup } = value;
  return (
    typeof keys.master_key === 'string' &&
    typeof keys.self_signing_key === 'string' &&
    typeof keys.user_signing_key === 'string' &&
    // The message backup key is there when the exporting device had it.
    (backup === undefined ||
      (isRecord(backup) &&
        typeof backup.algorithm === 'string' &&
        typeof backup.key === 'string' &&
        typeof backup.backup_version === 'string'))
  );
};

/**
 * The SDK's secrets bundle as JSON: the account's cross-signing keys, and the message backup key if
 * this device has it. It is NOT encrypted, because the SDK does not encrypt it and the person chose a
 * plain file. Anyone who gets it can act as this account.
 */
export const exportIdentityKeyFile = async (crypto: CryptoApi): Promise<string> => {
  if (!crypto.exportSecretsBundle) {
    throw new Error('This version of the encryption library cannot export identity keys.');
  }
  const { privateKeysCachedLocally: held } = await crypto.getCrossSigningStatus();
  if (!(held.masterKey && held.selfSigningKey && held.userSigningKey)) {
    throw new Error('This device does not hold your identity keys, so it cannot export them.');
  }
  return JSON.stringify(await crypto.exportSecretsBundle(), null, 2);
};

/** Imports a file made by exportIdentityKeyFile, then signs this device with the identity. */
export const importIdentityKeyFile = async (
  crypto: CryptoApi,
  deviceId: string,
  text: string
): Promise<void> => {
  if (!crypto.importSecretsBundle) {
    throw new Error('This version of the encryption library cannot import identity keys.');
  }
  let bundle: unknown;
  try {
    bundle = JSON.parse(text);
  } catch {
    throw new Error('This file does not contain identity keys.');
  }
  if (!isIdentityBundle(bundle)) {
    throw new Error('This file does not contain identity keys. Is it a message key file?');
  }
  await crypto.importSecretsBundle(bundle);
  // The bundle only installs the identity; it does not sign this device.
  // (bootstrapCrossSigning would skip signing when the identity already exists,
  // and may need secret storage.)
  await crypto.crossSignDevice(deviceId);
};

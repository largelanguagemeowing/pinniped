import { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';

type IdentityBundle = {
  cross_signing: { master_key: string; self_signing_key: string; user_signing_key: string };
  backup?: unknown;
};

const isIdentityBundle = (value: unknown): value is IdentityBundle => {
  const keys = (value as IdentityBundle | null)?.cross_signing;
  return (
    !!keys &&
    typeof keys.master_key === 'string' &&
    typeof keys.self_signing_key === 'string' &&
    typeof keys.user_signing_key === 'string'
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
  await crypto.importSecretsBundle(bundle as never);
  // The bundle only installs the identity; it does not sign this device.
  // (bootstrapCrossSigning would skip signing when the identity already exists,
  // and may need secret storage.)
  await crypto.crossSignDevice(deviceId);
};

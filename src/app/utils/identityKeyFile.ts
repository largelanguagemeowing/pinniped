import { CryptoApi } from 'matrix-js-sdk/lib/crypto-api';
import { decryptMegolmKeyFile, encryptMegolmKeyFile } from '../../util/cryptE2ERoomKeys';

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
 * The account's cross-signing keys (and the message backup key, if this device has it) as a
 * password-protected file. Anyone holding the file and its password can act as this account.
 */
export const exportIdentityKeyFile = async (
  crypto: CryptoApi,
  password: string
): Promise<ArrayBuffer> => {
  if (!crypto.exportSecretsBundle) {
    throw new Error('This version of the encryption library cannot export identity keys.');
  }
  const { privateKeysCachedLocally: held } = await crypto.getCrossSigningStatus();
  if (!(held.masterKey && held.selfSigningKey && held.userSigningKey)) {
    throw new Error('This device does not hold your identity keys, so it cannot export them.');
  }
  const bundle = await crypto.exportSecretsBundle();
  return encryptMegolmKeyFile(JSON.stringify(bundle), password);
};

/** Imports a file made by exportIdentityKeyFile, then signs this device with the identity. */
export const importIdentityKeyFile = async (
  crypto: CryptoApi,
  data: ArrayBuffer,
  password: string
): Promise<void> => {
  if (!crypto.importSecretsBundle) {
    throw new Error('This version of the encryption library cannot import identity keys.');
  }
  const bundle: unknown = JSON.parse(await decryptMegolmKeyFile(data, password));
  if (!isIdentityBundle(bundle)) {
    throw new Error('This file does not contain identity keys. Is it a message key file?');
  }
  await crypto.importSecretsBundle(bundle as never);
  // Same step the recovery key flow takes, so this device becomes verified.
  await crypto.bootstrapCrossSigning({});
};

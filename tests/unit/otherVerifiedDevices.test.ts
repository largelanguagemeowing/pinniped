import { describe, expect, it, vi } from 'vitest';
import { hasOtherVerifiedDevices } from '../../src/app/features/device-verification-gate/otherVerifiedDevices';

type FakeDevice = {
  deviceId: string;
  dehydrated?: boolean;
  identityKey?: string | undefined;
  signedByOwner: boolean;
};

const ME = '@me:x';
const OWN = 'THIS';

const cryptoWith = (devices: FakeDevice[] | undefined) => {
  const getDeviceVerificationStatus = vi.fn(async (_userId: string, deviceId: string) => {
    const device = devices?.find((d) => d.deviceId === deviceId);
    return device ? { signedByOwner: device.signedByOwner } : null;
  });
  const crypto = {
    getUserDeviceInfo: async () =>
      new Map(
        devices
          ? [
              [
                ME,
                new Map(
                  devices.map((d) => [
                    d.deviceId,
                    {
                      deviceId: d.deviceId,
                      dehydrated: !!d.dehydrated,
                      getIdentityKey: () => ('identityKey' in d ? d.identityKey : 'curve25519:key'),
                    },
                  ])
                ),
              ],
            ]
          : []
      ),
    getDeviceVerificationStatus,
  };
  return { crypto: crypto as never, getDeviceVerificationStatus };
};

const own: FakeDevice = { deviceId: OWN, signedByOwner: false };

describe('hasOtherVerifiedDevices', () => {
  it('is true when another device is signed by the account', async () => {
    const { crypto } = cryptoWith([own, { deviceId: 'LAPTOP', signedByOwner: true }]);
    expect(await hasOtherVerifiedDevices(crypto, ME, OWN)).toBe(true);
  });

  it('is false when this is the only device', async () => {
    const { crypto } = cryptoWith([own]);
    expect(await hasOtherVerifiedDevices(crypto, ME, OWN)).toBe(false);
  });

  it('is false when other devices exist but none can approve, because they are unverified too', async () => {
    const { crypto } = cryptoWith([
      own,
      { deviceId: 'OLD1', signedByOwner: false },
      { deviceId: 'OLD2', signedByOwner: false },
    ]);
    expect(await hasOtherVerifiedDevices(crypto, ME, OWN)).toBe(false);
  });

  it('does not count this device even if it is signed', async () => {
    const { crypto, getDeviceVerificationStatus } = cryptoWith([
      { deviceId: OWN, signedByOwner: true },
    ]);
    expect(await hasOtherVerifiedDevices(crypto, ME, OWN)).toBe(false);
    expect(getDeviceVerificationStatus).not.toHaveBeenCalledWith(ME, OWN);
  });

  it('ignores dehydrated devices, which cannot answer a request', async () => {
    const { crypto } = cryptoWith([
      own,
      { deviceId: 'DEHYDRATED', dehydrated: true, signedByOwner: true },
    ]);
    expect(await hasOtherVerifiedDevices(crypto, ME, OWN)).toBe(false);
  });

  it('ignores devices without an identity key', async () => {
    const { crypto } = cryptoWith([
      own,
      { deviceId: 'BROKEN', identityKey: undefined, signedByOwner: true },
    ]);
    expect(await hasOtherVerifiedDevices(crypto, ME, OWN)).toBe(false);
  });

  it('finds the one usable device among several that are not', async () => {
    const { crypto } = cryptoWith([
      own,
      { deviceId: 'DEHYDRATED', dehydrated: true, signedByOwner: true },
      { deviceId: 'OLD', signedByOwner: false },
      { deviceId: 'PHONE', signedByOwner: true },
    ]);
    expect(await hasOtherVerifiedDevices(crypto, ME, OWN)).toBe(true);
  });

  it('is false when the account has no device info at all', async () => {
    const { crypto } = cryptoWith(undefined);
    expect(await hasOtherVerifiedDevices(crypto, ME, OWN)).toBe(false);
  });

  it('treats a device with no verification status as not verified', async () => {
    const { crypto } = cryptoWith([own, { deviceId: 'GHOST', signedByOwner: true }]);
    (crypto as { getDeviceVerificationStatus: unknown }).getDeviceVerificationStatus = async () =>
      null;
    expect(await hasOtherVerifiedDevices(crypto, ME, OWN)).toBe(false);
  });
});

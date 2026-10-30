import React from 'react';
import { EventEmitter } from 'node:events';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OtherDevices,
  useOtherVerifiedDevices,
} from '../../src/app/features/device-verification-gate/otherVerifiedDevices';

const ME = '@me:x';

const state = vi.hoisted(() => ({ mx: undefined as unknown }));
vi.mock('../../src/app/hooks/useMatrixClient', () => ({ useMatrixClient: () => state.mx }));

type Deferred = { resolve: (devices: string[]) => void };

// A crypto whose device list answers only when the test says so, to control the order of answers.
const makeClient = () => {
  const mx = new EventEmitter() as EventEmitter & Record<string, unknown>;
  const pending: Deferred[] = [];
  const signed = new Set<string>();
  mx.getSafeUserId = () => ME;
  mx.getDeviceId = () => 'THIS';
  mx.getCrypto = () => ({
    getUserDeviceInfo: () =>
      new Promise((resolve) => {
        pending.push({
          resolve: (ids) =>
            resolve(
              new Map([
                [
                  ME,
                  new Map(
                    ids.map((id) => [
                      id,
                      { deviceId: id, dehydrated: false, getIdentityKey: () => 'key' },
                    ])
                  ),
                ],
              ])
            ),
        });
      }),
    getDeviceVerificationStatus: async (_user: string, id: string) => ({
      signedByOwner: signed.has(id),
    }),
  });
  return { mx, pending, signed };
};

describe('useOtherVerifiedDevices', () => {
  let r: ReactTestRenderer;
  let seen: OtherDevices;

  function Probe() {
    seen = useOtherVerifiedDevices();
    return null;
  }
  const mount = async () => {
    await act(async () => {
      r = create(<Probe />);
    });
  };
  const flush = () => act(async () => {});

  afterEach(() => act(() => r.unmount()));

  it('is checking until the first answer, then reports it', async () => {
    const { mx, pending, signed } = makeClient();
    state.mx = mx;
    signed.add('PHONE');
    await mount();
    expect(seen).toBe('checking');

    pending[0].resolve(['THIS', 'PHONE']);
    await flush();
    expect(seen).toBe('available');
  });

  it('corrects a wrong first answer when the device list updates', async () => {
    const { mx, pending, signed } = makeClient();
    state.mx = mx;
    signed.add('PHONE');
    await mount();

    // the list was only partly downloaded: this device alone
    pending[0].resolve(['THIS']);
    await flush();
    expect(seen).toBe('none');

    // the rest arrives and the SDK says the device list changed
    act(() => {
      mx.emit('crypto.devicesUpdated', [ME], false);
    });
    pending[1].resolve(['THIS', 'PHONE']);
    await flush();
    expect(seen).toBe('available');
  });

  it('ignores device updates for other people', async () => {
    const { mx, pending } = makeClient();
    state.mx = mx;
    await mount();
    pending[0].resolve(['THIS']);
    await flush();

    act(() => {
      mx.emit('crypto.devicesUpdated', ['@someone-else:x'], false);
    });
    expect(pending).toHaveLength(1);
    expect(seen).toBe('none');
  });

  it('lets a newer check win over a slower older one', async () => {
    const { mx, pending, signed } = makeClient();
    state.mx = mx;
    signed.add('PHONE');
    await mount();

    act(() => {
      mx.emit('crypto.devicesUpdated', [ME], false);
    });
    // the newer check answers first, the older one answers late with stale data
    pending[1].resolve(['THIS', 'PHONE']);
    await flush();
    pending[0].resolve(['THIS']);
    await flush();
    expect(seen).toBe('available');
  });

  it('offers the option when the check itself fails', async () => {
    const { mx } = makeClient();
    mx.getCrypto = () => ({
      getUserDeviceInfo: () => Promise.reject(new Error('store unavailable')),
    });
    state.mx = mx;
    await mount();
    await flush();
    expect(seen).toBe('available');
  });
});

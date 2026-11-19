/*
Copyright 2025 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockedObject,
  vi,
  type MockInstance,
} from 'vitest';
import { type CallMembership, type LivekitTransport } from 'matrix-js-sdk/lib/matrixrtc';
import { BehaviorSubject, filter, lastValueFrom } from 'rxjs';
import fetchMock from 'fetch-mock';

import { flushPromises, ownMemberMock, mockRtcMembership, testScope } from '../../../utils/test';
import {
  createLocalTransport$,
  JwtEndpointVersion,
  type LocalTransportWithSFUConfig,
} from '../../../../../../src/app/plugins/call/engine/state/CallViewModel/localMember/LocalTransport';
import { constant } from '../../../../../../src/app/plugins/call/engine/state/Behavior';
import {
  Epoch,
  ObservableScope,
  trackEpoch,
} from '../../../../../../src/app/plugins/call/engine/state/ObservableScope';
import {
  MatrixRTCTransportMissingError,
  FailToGetOpenIdToken,
} from '../../../../../../src/app/plugins/call/engine/utils/errors';
import * as openIDSFU from '../../../../../../src/app/plugins/call/engine/livekit/openIDSFU';
import { testJWTToken } from '../../../utils/test-fixtures';

describe('LocalTransport', () => {
  const openIdResponse: openIDSFU.SFUConfig = {
    url: 'https://lk.example.org',
    jwt: testJWTToken,
    livekitAlias: 'Akph4alDMhen',
    livekitIdentity: '@lk_user:ABCDEF',
  };

  const lkTransport: LivekitTransport = {
    type: 'livekit',
    livekit_service_url: 'https://lk.example.org',
  };

  beforeEach(() => vi.clearAllMocks());

  it('throws if config is missing', async () => {
    const { advertised$, active$ } = createLocalTransport$({
      scope: testScope(),
      roomId: '!room:example.org',
      useOldestMember: false,
      memberships$: constant(new Epoch<CallMembership[]>([])),
      client: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        _unstable_getRTCTransports: async () => Promise.resolve([]),
        getAccessToken: vi.fn().mockReturnValue('access_token'),
        getDomain: () => '',
        baseUrl: 'example.org',
        // These won't be called in this error path but satisfy the type
        getOpenIdToken: vi.fn(),
        getDeviceId: vi.fn(),
      },
      ownMembershipIdentity: ownMemberMock,
      forceJwtEndpoint: JwtEndpointVersion.Legacy,
      delayId$: constant('delay_id_mock'),
    });
    await flushPromises();

    expect(() => advertised$.value).toThrow(new MatrixRTCTransportMissingError(''));
    expect(() => active$.value).toThrow(new MatrixRTCTransportMissingError(''));
  });

  it('throws FailToGetOpenIdToken when OpenID fetch fails', async () => {
    // Provide a backend transport so makeTransportInternal resolves one
    const scope = new ObservableScope();
    const resolver = Promise.withResolvers<void>();
    vi.spyOn(openIDSFU, 'getSFUConfigWithOpenID').mockImplementation(async () => {
      await resolver.promise;
      throw new FailToGetOpenIdToken(new Error('no openid'));
    });
    const observations: unknown[] = [];
    const errors: Error[] = [];
    const { advertised$, active$ } = createLocalTransport$({
      scope,
      roomId: '!example_room_id',
      useOldestMember: false,
      memberships$: constant(new Epoch<CallMembership[]>([])),
      client: {
        baseUrl: 'https://lk.example.org',
        getDomain: () => '',
        getAccessToken: vi.fn().mockReturnValue('access_token'),
        // eslint-disable-next-line @typescript-eslint/naming-convention
        _unstable_getRTCTransports: async () => Promise.resolve([lkTransport]),
        getOpenIdToken: vi.fn(),
        getDeviceId: vi.fn(),
      },
      ownMembershipIdentity: ownMemberMock,
      forceJwtEndpoint: JwtEndpointVersion.Legacy,
      delayId$: constant('delay_id_mock'),
    });
    active$.subscribe(
      (o) => observations.push(o),
      (e) => errors.push(e)
    );
    resolver.resolve();
    await flushPromises();

    const expectedError = new FailToGetOpenIdToken(new Error('no openid'));
    expect(observations).toStrictEqual([null]);
    expect(errors).toStrictEqual([expectedError]);
    expect(() => advertised$.value).toThrow(expectedError);
    expect(() => active$.value).toThrow(expectedError);
  });

  it('emits preferred transport after OpenID resolves', async () => {
    // Transport discovery succeeds via the backend, but the OpenID JWT fetch is delayed

    const openIdResolver = Promise.withResolvers<openIDSFU.SFUConfig>();

    vi.spyOn(openIDSFU, 'getSFUConfigWithOpenID').mockReturnValue(openIdResolver.promise);

    const { advertised$, active$ } = createLocalTransport$({
      scope: testScope(),
      roomId: '!room:example.org',
      useOldestMember: false,
      memberships$: constant(new Epoch<CallMembership[]>([])),
      client: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        _unstable_getRTCTransports: async () => Promise.resolve([lkTransport]),
        getDomain: () => '',
        getOpenIdToken: vi.fn(),
        getDeviceId: vi.fn(),
        baseUrl: 'https://lk.example.org',
        getAccessToken: vi.fn().mockReturnValue('access_token'),
      },
      ownMembershipIdentity: ownMemberMock,
      forceJwtEndpoint: JwtEndpointVersion.Legacy,
      delayId$: constant('delay_id_mock'),
    });

    openIdResolver.resolve?.({
      url: 'https://lk.example.org',
      jwt: 'jwt',
      livekitAlias: 'Akph4alDMhen',
      livekitIdentity: ownMemberMock.userId + ':' + ownMemberMock.deviceId,
    });
    expect(advertised$.value).toBe(null);
    expect(active$.value).toBe(null);
    await flushPromises();
    // final
    const expectedTransport = {
      livekit_service_url: 'https://lk.example.org',
      type: 'livekit',
    };
    expect(advertised$.value).toStrictEqual(expectedTransport);
    expect(active$.value).toStrictEqual({
      refreshSFUConfig: expect.any(Function),
      transport: expectedTransport,
      sfuConfig: {
        jwt: 'jwt',
        livekitAlias: 'Akph4alDMhen',
        livekitIdentity: '@alice:example.org:DEVICE',
        url: 'https://lk.example.org',
      },
    });
  });

  describe('oldest member mode', () => {
    const aliceTransport: LivekitTransport = {
      type: 'livekit',
      livekit_service_url: 'https://alice.example.org',
    };
    const bobTransport: LivekitTransport = {
      type: 'livekit',
      livekit_service_url: 'https://bob.example.org',
    };
    const aliceMembership = mockRtcMembership('@alice:example.org', 'AAA', {
      fociPreferred: [aliceTransport],
    });
    const bobMembership = mockRtcMembership('@bob:example.org', 'BBB', {
      fociPreferred: [bobTransport],
    });

    let openIdSpy: MockInstance<(typeof openIDSFU)['getSFUConfigWithOpenID']>;
    beforeEach(() => {
      openIdSpy = vi.spyOn(openIDSFU, 'getSFUConfigWithOpenID').mockResolvedValue(openIdResponse);
    });

    it('updates active transport when oldest member changes', async () => {
      // Initially, Alice is the only member
      const memberships$ = new BehaviorSubject([aliceMembership]);

      const scope = testScope();
      const { advertised$, active$ } = createLocalTransport$({
        scope,
        roomId: '!example_room_id',
        useOldestMember: true,
        memberships$: scope.behavior(memberships$.pipe(trackEpoch())),
        client: {
          getDomain: () => '',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          _unstable_getRTCTransports: async () => Promise.resolve([]),
          getAccessToken: vi.fn().mockReturnValue('access_token'),
          getOpenIdToken: vi.fn(),
          getDeviceId: vi.fn(),
          baseUrl: 'https://lk.example.org',
        },
        ownMembershipIdentity: ownMemberMock,
        forceJwtEndpoint: JwtEndpointVersion.Legacy,
        delayId$: constant('delay_id_mock'),
      });

      expect(active$.value).toBe(null);
      await flushPromises();
      // SFU config should've been fetched
      expect(openIdSpy).toHaveBeenCalled();
      // Alice's transport should be active and advertised
      expect(active$.value?.transport).toStrictEqual(aliceTransport);
      expect(advertised$.value).toStrictEqual(aliceTransport);

      // Now Bob joins the call, but Alice is still the oldest member
      openIdSpy.mockClear();
      memberships$.next([aliceMembership, bobMembership]);
      await flushPromises();
      // No new SFU config should've been fetched
      expect(openIdSpy).not.toHaveBeenCalled();
      // Alice's transport should still be active and advertised
      expect(active$.value?.transport).toStrictEqual(aliceTransport);
      expect(advertised$.value).toStrictEqual(aliceTransport);

      // Now Bob takes Alice's place as the oldest member
      openIdSpy.mockClear();
      memberships$.next([bobMembership, aliceMembership]);
      // Active transport should reset to null until we have Bob's SFU config
      expect(active$.value).toStrictEqual(null);
      await flushPromises();
      // Bob's SFU config should've been fetched
      expect(openIdSpy).toHaveBeenCalled();
      // Bob's transport should be active, but Alice's should remain advertised
      // (since we don't want the change in oldest member to cause a wave of new
      // state events)
      expect(active$.value?.transport).toStrictEqual(bobTransport);
      expect(advertised$.value).toStrictEqual(aliceTransport);
    });

    it('advertises preferred transport when no other member exists', async () => {
      // Initially, there are no members
      const memberships$ = new BehaviorSubject<CallMembership[]>([]);

      const scope = testScope();
      const { advertised$, active$ } = createLocalTransport$({
        scope,
        roomId: '!example_room_id',
        useOldestMember: true,
        memberships$: scope.behavior(memberships$.pipe(trackEpoch())),
        client: {
          getDomain: () => '',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          _unstable_getRTCTransports: async () => Promise.resolve([aliceTransport]),
          getAccessToken: vi.fn().mockReturnValue('access_token'),
          getOpenIdToken: vi.fn(),
          getDeviceId: vi.fn(),
          baseUrl: 'https://lk.example.org',
        },
        ownMembershipIdentity: ownMemberMock,
        forceJwtEndpoint: JwtEndpointVersion.Legacy,
        delayId$: constant('delay_id_mock'),
      });

      expect(active$.value).toBe(null);
      await flushPromises();
      // Our own preferred transport should be advertised
      expect(advertised$.value).toStrictEqual(aliceTransport);
      // No transport should be active however (there is still no oldest member)
      expect(active$.value).toBe(null);

      // Now Bob joins the call and becomes the oldest member
      memberships$.next([bobMembership]);
      await flushPromises();
      // We should still advertise our own preferred transport (to avoid
      // unnecessary state changes)
      expect(advertised$.value).toStrictEqual(aliceTransport);
      // Bob's transport should become active
      expect(active$.value?.transport).toBe(bobTransport);
    });
  });

  type LocalTransportProps = Parameters<typeof createLocalTransport$>[0];

  describe('transport configuration mechanisms', () => {
    let localTransportOpts: LocalTransportProps & {
      client: MockedObject<LocalTransportProps['client']>;
    };
    let openIdResolver: PromiseWithResolvers<openIDSFU.SFUConfig>;
    beforeEach(() => {
      localTransportOpts = {
        ownMembershipIdentity: ownMemberMock,
        scope: testScope(),
        roomId: '!example_room_id',
        useOldestMember: false,
        forceJwtEndpoint: JwtEndpointVersion.Legacy,
        delayId$: constant(null),
        memberships$: constant(new Epoch<CallMembership[]>([])),
        client: {
          baseUrl: 'https://example.org',
          getDomain: vi.fn().mockReturnValue(''),
          // eslint-disable-next-line @typescript-eslint/naming-convention
          _unstable_getRTCTransports: vi.fn().mockResolvedValue([]),
          getAccessToken: vi.fn().mockReturnValue('access_token'),
          getOpenIdToken: vi.fn(),
          getDeviceId: vi.fn(),
        },
      };
      openIdResolver = Promise.withResolvers<openIDSFU.SFUConfig>();
      vi.spyOn(openIDSFU, 'getSFUConfigWithOpenID').mockReturnValue(openIdResolver.promise);
    });

    afterEach(() => {
      fetchMock.reset();
    });

    it('supports getting transport via backend', async () => {
      localTransportOpts.client._unstable_getRTCTransports.mockResolvedValue([
        { type: 'livekit', livekit_service_url: 'https://lk.example.org' },
      ]);
      const { advertised$, active$ } = createLocalTransport$(localTransportOpts);
      openIdResolver.resolve?.(openIdResponse);
      expect(advertised$.value).toBe(null);
      expect(active$.value).toBe(null);
      await flushPromises();
      const expectedTransport = {
        livekit_service_url: 'https://lk.example.org',
        type: 'livekit',
      };
      expect(advertised$.value).toStrictEqual(expectedTransport);
      expect(active$.value).toStrictEqual({
        refreshSFUConfig: expect.any(Function),
        transport: expectedTransport,
        sfuConfig: {
          jwt: 'e30=.eyJzdWIiOiJAbWU6ZXhhbXBsZS5vcmc6QUJDREVGIiwidmlkZW8iOnsicm9vbSI6IiFleGFtcGxlX3Jvb21faWQifX0=.e30=',
          livekitAlias: 'Akph4alDMhen',
          livekitIdentity: '@lk_user:ABCDEF',
          url: 'https://lk.example.org',
        },
      });
    });

    it('fails fast if the openID request fails for backend config', async () => {
      localTransportOpts.client._unstable_getRTCTransports.mockResolvedValue([
        { type: 'livekit', livekit_service_url: 'https://lk.example.org' },
      ]);
      openIdResolver.reject(new FailToGetOpenIdToken(new Error('Test driven error')));
      await expect(async () =>
        lastValueFrom(createLocalTransport$(localTransportOpts).active$)
      ).rejects.toThrow(expect.any(FailToGetOpenIdToken));
    });

    it('supports getting transport via well-known', async () => {
      localTransportOpts.client.getDomain.mockReturnValue('example.org');
      fetchMock.getOnce('https://example.org/.well-known/matrix/client', {
        'org.matrix.msc4143.rtc_foci': [
          { type: 'livekit', livekit_service_url: 'https://lk.example.org' },
        ],
      });
      const { advertised$, active$ } = createLocalTransport$(localTransportOpts);
      openIdResolver.resolve?.(openIdResponse);
      expect(advertised$.value).toBe(null);
      expect(active$.value).toBe(null);
      await flushPromises();
      const expectedTransport = {
        livekit_service_url: 'https://lk.example.org',
        type: 'livekit',
      };
      expect(advertised$.value).toStrictEqual(expectedTransport);
      expect(active$.value).toStrictEqual({
        refreshSFUConfig: expect.any(Function),
        transport: expectedTransport,
        sfuConfig: {
          jwt: 'e30=.eyJzdWIiOiJAbWU6ZXhhbXBsZS5vcmc6QUJDREVGIiwidmlkZW8iOnsicm9vbSI6IiFleGFtcGxlX3Jvb21faWQifX0=.e30=',
          livekitAlias: 'Akph4alDMhen',
          livekitIdentity: '@lk_user:ABCDEF',
          url: 'https://lk.example.org',
        },
      });
      expect(fetchMock.done()).toEqual(true);
    });

    it('fails fast if the openId request fails for the well-known config', async () => {
      localTransportOpts.client.getDomain.mockReturnValue('example.org');
      fetchMock.getOnce('https://example.org/.well-known/matrix/client', {
        'org.matrix.msc4143.rtc_foci': [
          { type: 'livekit', livekit_service_url: 'https://lk.example.org' },
        ],
      });
      openIdResolver.reject(new FailToGetOpenIdToken(new Error('Test driven error')));
      await expect(async () =>
        lastValueFrom(createLocalTransport$(localTransportOpts).active$)
      ).rejects.toThrow(expect.any(FailToGetOpenIdToken));
    });

    it('throws if no options are available', async () => {
      const { advertised$, active$ } = createLocalTransport$({
        scope: testScope(),
        ownMembershipIdentity: ownMemberMock,
        roomId: '!example_room_id',
        useOldestMember: false,
        forceJwtEndpoint: JwtEndpointVersion.Legacy,
        delayId$: constant(null),
        memberships$: constant(new Epoch<CallMembership[]>([])),
        client: {
          getDomain: () => '',
          baseUrl: 'https://example.org',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          _unstable_getRTCTransports: async () => Promise.resolve([]),
          getAccessToken: vi.fn().mockReturnValue('access_token'),
          // These won't be called in this error path but satisfy the type
          getOpenIdToken: vi.fn(),
          getDeviceId: vi.fn(),
        },
      });
      await flushPromises();

      expect(() => advertised$.value).toThrow(new MatrixRTCTransportMissingError(''));
      expect(() => active$.value).toThrow(new MatrixRTCTransportMissingError(''));
    });
  });

  it('should not update advertised/active transport on delayID changes, but delay Id delegation should be called', async () => {
    // For simplicity, the backend provides the transport

    const authCallSpy = vi
      .spyOn(openIDSFU, 'getSFUConfigWithOpenID')
      .mockResolvedValue(openIdResponse);

    const delayId$ = new BehaviorSubject<string | null>(null);

    const { advertised$, active$ } = createLocalTransport$({
      scope: testScope(),
      ownMembershipIdentity: ownMemberMock,
      roomId: '!example_room_id',
      // We want multi-sdu
      useOldestMember: false,
      forceJwtEndpoint: JwtEndpointVersion.Legacy,
      delayId$: delayId$,
      memberships$: constant(new Epoch<CallMembership[]>([])),
      client: {
        getDomain: () => '',
        baseUrl: 'https://example.org',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        _unstable_getRTCTransports: async () => Promise.resolve([lkTransport]),
        getAccessToken: vi.fn().mockReturnValue('access_token'),
        // These won't be called in this error path but satisfy the type
        getOpenIdToken: vi.fn(),
        getDeviceId: vi.fn(),
      },
    });

    const advertisedValues: LivekitTransport[] = [];
    const activeValues: LocalTransportWithSFUConfig[] = [];
    advertised$.pipe(filter((v) => v !== null)).subscribe((t) => advertisedValues.push(t));
    active$.pipe(filter((v) => v !== null)).subscribe((t) => activeValues.push(t));

    await flushPromises();

    // we have now an active and an advertised
    expect(advertisedValues.length).toEqual(1);
    expect(activeValues.length).toEqual(1);
    expect(advertisedValues[0]!.livekit_service_url).toEqual('https://lk.example.org');
    expect(activeValues[0]!.transport.livekit_service_url).toEqual('https://lk.example.org');

    expect(authCallSpy).toHaveBeenCalledTimes(2);
    // Now emits 3 new delays id
    delayId$.next('delay_id_1');
    await flushPromises();
    delayId$.next('delay_id_2');
    await flushPromises();
    delayId$.next('delay_id_3');
    await flushPromises();

    // No new emissions should've happened, it is the same transport.
    expect(advertisedValues.length).toEqual(1);
    expect(activeValues.length).toEqual(1);

    // Still we should have updated the delayID to auth
    expect(authCallSpy).toHaveBeenCalledTimes(4 * 2 /* 2 calls for each delayId ?? why */);

    expect(authCallSpy).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        delayId: 'delay_id_3',
      }),
      expect.anything()
    );
  });
});

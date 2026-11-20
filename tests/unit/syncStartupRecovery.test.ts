import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, MatrixClient, SyncState } from 'matrix-js-sdk';
import { createSyncOptions } from '../../src/client/syncOptions';
import { USER_PROFILE_FIELDS } from '../../src/types/matrix/profile';

type VersionsReply = 'ok' | 'error' | 'revoke';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** A homeserver whose /versions reply is scripted per call; the rest of startup is healthy. */
const fakeHomeserver = () => {
  const server = {
    versions: (() => 'ok') as (call: number) => VersionsReply,
    revoked: false,
    requests: [] as string[],
    filters: [] as Record<string, unknown>[],
    count: (path: string) => server.requests.filter((p) => p === path).length,
  };
  let versionsCalls = 0;
  let synced = false;

  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const path = url.pathname.replace('/_matrix/client', '');
    server.requests.push(path);

    let versions: VersionsReply | undefined;
    if (path === '/versions') {
      versionsCalls += 1;
      versions = server.versions(versionsCalls);
      if (versions === 'revoke') server.revoked = true;
    }
    if (server.revoked) {
      return json(401, { errcode: 'M_UNKNOWN_TOKEN', error: 'Unknown access token' });
    }
    if (versions === 'error') return json(500, { errcode: 'M_UNKNOWN', error: 'Internal error' });
    if (versions === 'ok') return json(200, { versions: ['v1.12'], unstable_features: {} });
    if (path === '/v3/pushrules/') return json(200, { global: {} });
    if (path.endsWith('/filter')) {
      server.filters.push(JSON.parse(String(init?.body)));
      return json(200, { filter_id: 'filter' });
    }
    if (path === '/v3/sync') {
      if (!synced) {
        synced = true;
        return json(200, { next_batch: 'batch' });
      }
      // later long-polls stay open until the client stops
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    }
    return json(404, { errcode: 'M_UNRECOGNIZED', error: 'Unrecognized request' });
  };

  return { server, fetchFn };
};

const clients: MatrixClient[] = [];

const startClient = async (fetchFn: typeof fetch): Promise<MatrixClient> => {
  const mx = createClient({
    baseUrl: 'https://hs.example',
    userId: '@pinniped:hs.example',
    accessToken: 'token',
    deviceId: 'DEVICE',
    fetchFn,
  });
  clients.push(mx);
  await mx.startClient(createSyncOptions());
  return mx;
};

describe('sync startup', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    clients.splice(0).forEach((mx) => mx.stopClient());
    vi.useRealTimers();
  });

  it('reports the outage and starts syncing once /versions recovers', async () => {
    const { server, fetchFn } = fakeHomeserver();
    server.versions = () => 'error';
    const mx = await startClient(fetchFn);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.count('/v3/sync')).toBe(0);
    expect(mx.getSyncState()).toBe(SyncState.Error);
    expect(mx.getSyncStateData()?.error).toMatchObject({ httpStatus: 500 });

    server.versions = () => 'ok';
    await vi.advanceTimersByTimeAsync(15_000);
    expect(server.count('/v3/sync')).toBeGreaterThan(0);
    expect(mx.getSyncState()).toBe(SyncState.Syncing);
    expect(server.filters).toContainEqual(
      expect.objectContaining({
        'org.matrix.msc4429.profile_fields': { ids: USER_PROFILE_FIELDS },
      })
    );
  });

  it('stops instead of retrying when the access token is revoked during startup', async () => {
    const { server, fetchFn } = fakeHomeserver();
    // the client's own first /versions fails, so the sync's profile check asks again
    server.versions = (call) => (call === 1 ? 'error' : 'revoke');
    const mx = await startClient(fetchFn);

    await vi.advanceTimersByTimeAsync(5_000);
    const versionsCalls = server.count('/versions');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(server.count('/versions')).toBe(versionsCalls);
    expect(server.count('/v3/sync')).toBe(0);
    expect(mx.getSyncState()).toBe(SyncState.Error);
    expect(mx.getSyncStateData()?.error).toMatchObject({ errcode: 'M_UNKNOWN_TOKEN' });
  });
});

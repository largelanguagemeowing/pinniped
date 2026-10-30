import {
  createClient,
  MatrixClient,
  IndexedDBStore,
  IndexedDBCryptoStore,
  MemoryStore,
} from 'matrix-js-sdk';
import {
  AllDevicesIsolationMode,
  OnlySignedDevicesIsolationMode,
} from 'matrix-js-sdk/lib/crypto-api';

import { cryptoCallbacks } from './secretStorageKeys';
import { clearNavToActivePathStore } from '../app/state/navToActivePath';
import { getSettings } from '../app/state/settings';
import { playEventSound } from '../app/sound/play';
import { pushSessionToSW } from '../sw-session';
import { compactServerAcls } from './compactServerAcl';
import { USER_PROFILE_FIELDS } from '../types/matrix/profile';
import { reportClientStorageError, resetClientStorageError } from './storageStatus';

type Session = {
  baseUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
};

const SYNC_STORE_DB_NAME = 'web-sync-store';
// The SDK prefixes the name it is given, so this is the real IndexedDB name.
const SYNC_STORE_IDB_NAME = `matrix-js-sdk:${SYNC_STORE_DB_NAME}`;

const SYNC_STORE_BLOCKED_MESSAGE =
  'Another Pinniped tab or window is still open. Close it, then try again.';

// The SDK keeps unsent events here, per room, outside the sync store.
const PENDING_EVENTS_KEY_PREFIX = 'mx_pending_events_';

const createSyncStore = (): IndexedDBStore =>
  new IndexedDBStore({
    indexedDB: global.indexedDB,
    localStorage: global.localStorage,
    dbName: SYNC_STORE_DB_NAME,
  });

const createMatrixClient = (
  session: Session,
  store: IndexedDBStore | MemoryStore
): MatrixClient => {
  const legacyCryptoStore = new IndexedDBCryptoStore(global.indexedDB, 'crypto-store');

  if (store instanceof IndexedDBStore) store.on('degraded', reportClientStorageError);

  return createClient({
    baseUrl: session.baseUrl,
    accessToken: session.accessToken,
    userId: session.userId,
    store,
    cryptoStore: legacyCryptoStore,
    deviceId: session.deviceId,
    timelineSupport: true,
    cryptoCallbacks: cryptoCallbacks as any,
    verificationMethods: ['m.sas.v1'],
  });
};

// The sync cache is disposable because the server can resend it. Delete only
// that database, never the crypto stores, which hold this device's keys.
const deleteSyncStoreDatabase = (): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const req = global.indexedDB.deleteDatabase(SYNC_STORE_IDB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    // Another tab still holds the database open. Without this the request
    // waits forever and the caller never finishes.
    req.onblocked = () => reject(new Error(SYNC_STORE_BLOCKED_MESSAGE));
  });

const deleteSyncStore = async (store: IndexedDBStore): Promise<void> => {
  // Close our own connection first so the delete is not blocked by it.
  await store.destroy().catch(() => undefined);
  await deleteSyncStoreDatabase();
};

export const initClient = async (session: Session): Promise<MatrixClient> => {
  resetClientStorageError();

  let indexedDBStore = createSyncStore();
  let mx = createMatrixClient(session, indexedDBStore);
  try {
    await indexedDBStore.startup();
  } catch (err) {
    // startup() reads the cached sync row without the SDK's degrade fallback,
    // so one unreadable row would block the app. Rebuild the cache instead.
    console.error('Sync cache is unreadable, rebuilding it from the server', err);
    try {
      await deleteSyncStore(indexedDBStore);
      indexedDBStore = createSyncStore();
      mx = createMatrixClient(session, indexedDBStore);
      await indexedDBStore.startup();
    } catch (retryErr) {
      // The cache could not be deleted or still fails when recreated. Run
      // without a persistent cache: the app works, but each launch does a full
      // sync, and the storage banner tells the user.
      console.error('Sync cache still unreadable, running without it', retryErr);
      await indexedDBStore.destroy().catch(() => undefined);
      reportClientStorageError(retryErr as Error);
      mx = createMatrixClient(session, new MemoryStore());
    }
  }
  await mx.initRustCrypto();

  // Apply the user's device-isolation preference. The crypto store holds this
  // only in memory, so we re-apply it on every client init from localStorage.
  const crypto = mx.getCrypto();
  if (crypto) {
    crypto.setDeviceIsolationMode(
      getSettings().onlySignedDevices
        ? new OnlySignedDevicesIsolationMode()
        : new AllDevicesIsolationMode(false)
    );
  }

  mx.setMaxListeners(50);

  return mx;
};

/**
 * Replaces any cached copy of the homeserver's client well-known. The call widget reads it
 * through the HTTP cache on every join (for the RTC focus), and a well-known served without
 * Cache-Control can be heuristically cached for days, hiding server-side changes.
 */
const refreshWellKnownCache = (mx: MatrixClient) => {
  const domain = mx.getDomain();
  if (!domain) return;
  fetch(`https://${domain}/.well-known/matrix/client`, { cache: 'reload' }).catch(() => {
    // best effort: a stale copy just keeps the previous RTC focus
  });
};

export const startClient = async (mx: MatrixClient) => {
  // Push the session to the service worker before syncing so that
  // authenticated media requests have the Authorization header from the
  // very first request. This covers the login -> navigate flow where no
  // page reload occurs and the SW may not have the session yet.
  pushSessionToSW(mx.baseUrl, mx.getAccessToken() ?? undefined);
  refreshWellKnownCache(mx);
  compactServerAcls(mx);
  await mx.startClient({
    lazyLoadMembers: true,
    unstableMSC4429SyncUserProfileFields: USER_PROFILE_FIELDS,
  });
};

const clearPendingEvents = () => {
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(PENDING_EVENTS_KEY_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => window.localStorage.removeItem(key));
};

const CLEAR_CACHE_TIMEOUT_MS = 5000;

export const clearCacheAndReload = async (mx: MatrixClient) => {
  mx.stopClient();
  clearNavToActivePathStore(mx.getSafeUserId());
  // js-sdk's clearDatabase only logs when another tab blocks the delete, so the
  // promise never settles; stop waiting and say so instead of hanging silently.
  const deleted = await Promise.race([
    mx.store
      .deleteAllData()
      .catch(() => undefined)
      .then(() => true),
    new Promise<boolean>((resolve) => {
      setTimeout(() => resolve(false), CLEAR_CACHE_TIMEOUT_MS);
    }),
  ]);
  if (!deleted) {
    window.alert(SYNC_STORE_BLOCKED_MESSAGE);
    return;
  }
  // When startup fell back to a MemoryStore, deleteAllData() never touches
  // IndexedDB, so delete the sync cache database directly as well.
  try {
    await deleteSyncStoreDatabase();
  } catch (err) {
    if (err instanceof Error && err.message === SYNC_STORE_BLOCKED_MESSAGE) {
      // Reloading now would queue behind the blocked delete and hang startup.
      window.alert(err.message);
      return;
    }
  }
  clearPendingEvents();
  window.location.reload();
};

export const logoutClient = async (mx: MatrixClient) => {
  pushSessionToSW();
  mx.stopClient();
  // The reload below would cut the sound off.
  const signedOut = playEventSound('signout');
  try {
    await mx.logout();
  } catch {
    // ignore if failed to logout
  }
  await mx.clearStores();
  await signedOut;
  window.localStorage.clear();
  window.location.reload();
};

export const clearLoginData = async () => {
  const dbs = await window.indexedDB.databases();

  dbs.forEach((idbInfo) => {
    const { name } = idbInfo;
    if (name) {
      window.indexedDB.deleteDatabase(name);
    }
  });

  window.localStorage.clear();
  window.location.reload();
};

import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { ClientEvent, MatrixClient } from 'matrix-js-sdk';
import {
  getProfileRichPresence,
  MSC4320_RPC,
  M_RPC,
  RichPresence,
} from '../../types/matrix/richPresence';
import { useMatrixClient } from './useMatrixClient';
import { userRichPresenceAtomFamily } from '../state/richPresence';

const hasRichPresenceField = (profile: Record<string, unknown>): boolean =>
  Object.prototype.hasOwnProperty.call(profile, MSC4320_RPC) ||
  Object.prototype.hasOwnProperty.call(profile, M_RPC);

// Re-fetch the profile at least this often so the displayed presence stays
// fresh even when push (UserProfileUpdate) events aren't arriving.
// Longest song-end timer worth scheduling; anything beyond is treated as bogus.
const MAX_SONG_END_DELAY = 6 * 60 * 60 * 1000;

const REFRESH_INTERVAL = 3 * 60 * 1000;

// Opening a big member list mounts hundreds of rows at once; cap the number of
// profile requests in flight and back off when the server rate-limits us.
const MAX_CONCURRENT_FETCHES = 4;
const MAX_RATE_LIMIT_RETRIES = 3;
let activeFetches = 0;
const fetchWaiters: (() => void)[] = [];

const acquireFetchSlot = async () => {
  if (activeFetches < MAX_CONCURRENT_FETCHES) {
    activeFetches += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    fetchWaiters.push(resolve);
  });
};

const releaseFetchSlot = () => {
  const next = fetchWaiters.shift();
  if (next) next();
  else activeFetches -= 1;
};

const fetchProfileThrottled = async (
  mx: MatrixClient,
  userId: string
): Promise<Record<string, unknown>> => {
  await acquireFetchSlot();
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await mx.getExtendedProfile(userId);
      } catch (err) {
        const { errcode, data } = err as { errcode?: string; data?: { retry_after_ms?: number } };
        if (errcode !== 'M_LIMIT_EXCEEDED' || attempt >= MAX_RATE_LIMIT_RETRIES) throw err;
        const wait = Math.min(data?.retry_after_ms ?? 2000, 30_000);

        await new Promise((resolve) => {
          setTimeout(resolve, wait);
        });
      }
    }
  } finally {
    releaseFetchSlot();
  }
};

type RichPresenceSetter = (value: RichPresence | undefined) => void;

type Subscription = {
  count: number;
  stop: () => void;
  teardown?: ReturnType<typeof setTimeout>;
};

// Keyed by client first so a new session never reuses another client's fetches.
const subscriptions = new WeakMap<MatrixClient, Map<string, Subscription>>();

// Keep a subscription alive briefly after its last consumer unmounts, so rows
// that remount while a list reorders reuse it instead of refetching.
const TEARDOWN_GRACE = 10_000;

// One profile fetch, update listener and heartbeat per user, shared by every
// component that shows that user's rich presence.
const startSubscription = (
  mx: MatrixClient,
  userId: string,
  setRichPresence: RichPresenceSetter
): (() => void) => {
  let active = true;
  let updateVersion = 0;

  const handleProfileUpdate = (updatedUserId: string, profile: Record<string, unknown> | null) => {
    if (updatedUserId !== userId) return;

    updateVersion += 1;
    if (profile !== null && hasRichPresenceField(profile)) {
      setRichPresence(getProfileRichPresence(profile));
      return;
    }
    // The update may be a delta about some other field, so its lacking ours
    // proves nothing. Ask the server: a stopped publisher (property deleted)
    // shows up there as the field missing, which clears.
    loadProfile();
  };

  mx.on(ClientEvent.UserProfileUpdate, handleProfileUpdate);

  const loadProfile = async () => {
    const loadVersion = updateVersion;
    try {
      const profile = await fetchProfileThrottled(mx, userId);
      if (active && loadVersion === updateVersion) {
        setRichPresence(getProfileRichPresence(profile));
      }
    } catch {
      // Keep the last known state on a failed refresh; only the expiry timer
      // or a profile update clears it.
    }
  };

  loadProfile();

  // Heartbeat: re-fetch periodically so a stale "Listening to ..." card
  // doesn't linger when the publisher stops emitting push updates.
  const heartbeat = setInterval(loadProfile, REFRESH_INTERVAL);

  return () => {
    active = false;
    clearInterval(heartbeat);
    mx.removeListener(ClientEvent.UserProfileUpdate, handleProfileUpdate);
  };
};

const subscribe = (
  mx: MatrixClient,
  userId: string,
  setRichPresence: RichPresenceSetter
): (() => void) => {
  let clientSubs = subscriptions.get(mx);
  if (!clientSubs) {
    clientSubs = new Map();
    subscriptions.set(mx, clientSubs);
  }
  const subs = clientSubs;
  let sub = subs.get(userId);
  if (!sub) {
    sub = { count: 0, stop: startSubscription(mx, userId, setRichPresence) };
    subs.set(userId, sub);
  }
  clearTimeout(sub.teardown);
  sub.count += 1;

  const current = sub;
  return () => {
    current.count -= 1;
    if (current.count > 0) return;
    current.teardown = setTimeout(() => {
      if (current.count > 0) return;
      current.stop();
      if (subs.get(userId) === current) subs.delete(userId);
    }, TEARDOWN_GRACE);
  };
};

export const useUserRichPresence = (userId: string): RichPresence | undefined => {
  const mx = useMatrixClient();
  const [richPresence, setRichPresence] = useAtom(userRichPresenceAtomFamily(userId));

  useEffect(() => {
    if (!userId) {
      setRichPresence(undefined);
      return undefined;
    }
    return subscribe(mx, userId, setRichPresence);
  }, [mx, userId, setRichPresence]);

  // Expire cached activity even if the publisher crashed and no profile update arrives.
  useEffect(() => {
    const expiresAt = richPresence?.expiresAt;
    if (expiresAt === undefined) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    const expire = () => {
      const delay = expiresAt - Date.now();
      if (delay > 0) {
        timer = setTimeout(expire, Math.min(delay, 2_147_483_647));
        return;
      }
      setRichPresence((current) =>
        current?.expiresAt !== undefined && current.expiresAt <= Date.now() ? undefined : current
      );
    };
    expire();
    return () => clearTimeout(timer);
  }, [richPresence, setRichPresence]);

  // Re-fetch when the current media track reaches its end time, so we pick up
  // the next song promptly instead of waiting for the next heartbeat.
  useEffect(() => {
    if (!userId || !richPresence || richPresence.type !== 'media' || !richPresence.progress)
      return undefined;
    const endTs = richPresence.progress.timeComplete;
    if (endTs === undefined || !Number.isFinite(endTs) || endTs < 1_000_000_000) return undefined;
    const endMs = endTs > 1_000_000_000_000 ? endTs : endTs * 1000;
    const delay = endMs - Date.now();
    // setTimeout fires immediately for delays past 2^31-1, which a bogus
    // timestamp would turn into a refetch loop; the heartbeat covers those.
    if (delay <= 0 || delay > MAX_SONG_END_DELAY) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      mx.getExtendedProfile(userId)
        .then((profile: Record<string, unknown>) => {
          if (!cancelled) setRichPresence(getProfileRichPresence(profile));
        })
        .catch(() => undefined);
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mx, userId, richPresence, setRichPresence]);

  return richPresence?.expiresAt !== undefined && richPresence.expiresAt <= Date.now()
    ? undefined
    : richPresence;
};

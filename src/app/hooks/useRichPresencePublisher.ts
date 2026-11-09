import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { useMatrixClient } from './useMatrixClient';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import { richPresenceBridgeStatusAtom } from '../state/richPresenceBridge';
import {
  MSC4320_RPC,
  RICH_PRESENCE_EXPIRES_AT,
  RICH_PRESENCE_TTL,
} from '../../types/matrix/richPresence';
import {
  isMediaPayload,
  mapDiscordActivity,
  sameActivityPayload,
  withCoverArt,
  type ActivityPayload,
} from '../utils/discordActivity';
import type { DiscordRichPresenceActivity } from '../utils/device';
import { isMxcUrl } from '../utils/mxc';

// Minimum interval between profile writes. Discord-RPC clients can fire
// SET_ACTIVITY on every progress tick; coalesce to avoid hammering the HS.
const MIN_WRITE_INTERVAL = 5000;
const REFRESH_INTERVAL = 60 * 1000;

/**
 * Publishes the local Discord-RPC activity (captured by the desktop
 * impersonator) as the user's MSC4320 rich presence. Desktop-only and
 * off-by-default; a no-op in the web build. Mounted globally in ClientRoot.
 *
 * Cover art is resolved through the homeserver's preview_url endpoint: it
 * fetches and caches the external image and returns an mxc://, which the
 * reader renders natively. No client-side download/upload or SSRF surface.
 */
export const useRichPresencePublisher = () => {
  const mx = useMatrixClient();
  const [enabled] = useSetting(settingsAtom, 'publishRichPresence');
  const setStatus = useSetAtom(richPresenceBridgeStatusAtom);

  useEffect(() => {
    if (!enabled) {
      setStatus(undefined);
      return undefined;
    }
    const bridge = window.cinnyDesktop;
    if (!bridge || !bridge.supportsRichPresenceBridge) {
      setStatus(undefined);
      return undefined;
    }
    const start = bridge.startRichPresenceBridge;
    const subscribe = bridge.onRichPresenceActivity;
    if (!start || !subscribe) {
      setStatus({ state: 'error', error: 'bridge API unavailable' });
      return undefined;
    }

    let stopped = false;
    let pending: ActivityPayload | null = null;
    let lastWritten: ActivityPayload | null = null;
    let lastWriteAt = 0;
    let inFlight = false;
    let unsubscribe: (() => void) | undefined;

    // Cover-art resolution: turn an external image URL into an MXC via the
    // homeserver's preview_url endpoint. Deduped by URL so a repeated cover
    // (same album) never re-fetches.
    const coverCache = new Map<string, string | null>(); // url -> mxc, or null if unavailable
    const resolving = new Set<string>();
    let currentCoverUrl: string | undefined;

    setStatus({ state: 'starting' });

    const tick = async () => {
      if (stopped || inFlight) return;
      if (
        sameActivityPayload(pending, lastWritten) &&
        (!pending || Date.now() - lastWriteAt < REFRESH_INTERVAL)
      )
        return;
      // Capture the write so an activity update during the request isn't lost.
      const writing = pending;
      inFlight = true;
      try {
        if (writing) {
          await mx.setExtendedProfileProperty(MSC4320_RPC, {
            ...writing,
            [RICH_PRESENCE_EXPIRES_AT]: Date.now() + RICH_PRESENCE_TTL,
          });
        } else {
          await mx.deleteExtendedProfileProperty(MSC4320_RPC);
        }
        // Cleanup may have raced a write already in flight.
        if (stopped && writing) await mx.deleteExtendedProfileProperty(MSC4320_RPC);
        lastWritten = writing;
        lastWriteAt = Date.now();
      } catch {
        // Server may not support MSC4133 extended profiles; stay silent.
      }
      inFlight = false;
    };

    const applyCover = (url: string, mxc: string | null) => {
      if (stopped || !mxc || currentCoverUrl !== url || !pending) return;
      const hasCover = isMediaPayload(pending) ? !!pending.cover_art : !!pending.image;
      if (hasCover) return;
      pending = withCoverArt(pending, mxc);
      tick();
    };

    const resolveCover = (url: string) => {
      if (coverCache.has(url)) {
        applyCover(url, coverCache.get(url) ?? null);
        return;
      }
      if (resolving.has(url)) return;
      resolving.add(url);
      mx.getUrlPreview(url, Date.now())
        .then((prev: { 'og:image'?: string }) => {
          const img = prev?.['og:image'];
          const mxc = isMxcUrl(img) ? img : null;
          coverCache.set(url, mxc);
          resolving.delete(url);
          applyCover(url, mxc);
        })
        .catch(() => {
          // Preview disabled / blocked / unreachable: skip the cover silently.
          coverCache.set(url, null);
          resolving.delete(url);
        });
    };

    const handleActivity = (activity: DiscordRichPresenceActivity | null) => {
      if (stopped) return;
      if (!activity) {
        pending = null;
        currentCoverUrl = undefined;
      } else {
        const { payload, coverUrl } = mapDiscordActivity(activity);
        pending = payload;
        currentCoverUrl = coverUrl;
        // Synchronous apply when the cover was resolved on a previous track.
        if (coverUrl) resolveCover(coverUrl);
      }
      // Leading-edge write when the throttle window has elapsed; otherwise the
      // interval tick below flushes it within MIN_WRITE_INTERVAL.
      if (Date.now() - lastWriteAt >= MIN_WRITE_INTERVAL) tick();
    };

    const interval = setInterval(() => {
      tick();
    }, MIN_WRITE_INTERVAL);

    const init = async () => {
      const result = await start();
      if (stopped) return;
      if (result?.ok) {
        setStatus({ state: 'running', path: result.path, index: result.index });
        unsubscribe = subscribe(handleActivity);
      } else {
        setStatus({ state: 'error', error: result?.error ?? 'unknown error' });
      }
    };
    init().catch(() => undefined);

    return () => {
      stopped = true;
      clearInterval(interval);
      unsubscribe?.();
      // Leave no stale presence behind when disabling or tearing down.
      mx.deleteExtendedProfileProperty(MSC4320_RPC).catch(() => undefined);
      bridge.stopRichPresenceBridge?.().catch(() => undefined);
      setStatus({ state: 'stopped' });
    };
  }, [mx, enabled, setStatus]);
};

/** Renders nothing; exists to host the publisher hook inside the client tree. */
export function RichPresencePublisher() {
  useRichPresencePublisher();
  return null;
}

import { useEffect } from 'react';
import { setUserIdle } from '../state/idle';
import { sendPresence } from '../state/statusMessage';
import { useSetting } from '../state/hooks/settings';
import { settingsAtom } from '../state/settings';
import { useMatrixClient } from './useMatrixClient';

export const IDLE_AFTER_MS = 5 * 60 * 1000;
const DESKTOP_POLL_MS = 15 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Tracks user idleness (system-wide in the desktop app, in-window on the web)
 * and reflects it as `unavailable` presence, without overriding a presence the
 * user chose themselves.
 */
export function IdleDetector() {
  const mx = useMatrixClient();
  const [enabled] = useSetting(settingsAtom, 'idleDetection');

  useEffect(() => {
    if (!enabled) return undefined;
    let ownedAway = false;
    let disposed = false;

    const applyPresence = (idle: boolean) => {
      const userId = mx.getUserId();
      if (!userId) return;
      if (idle) {
        if (mx.getUser(userId)?.presence !== 'online') return;
        ownedAway = true;
        sendPresence(mx, 'unavailable').catch(() => {
          ownedAway = false;
        });
      } else if (ownedAway) {
        ownedAway = false;
        sendPresence(mx, 'online').catch(() => undefined);
      }
    };

    const setIdle = (idle: boolean) => {
      if (disposed) return;
      setUserIdle(idle);
      applyPresence(idle);
    };

    const desktopIdle = window.pinnipedDesktop?.getSystemIdleTime;
    if (desktopIdle) {
      const poll = async () => {
        try {
          const seconds = await desktopIdle();
          setIdle(seconds * 1000 >= IDLE_AFTER_MS);
        } catch {
          // leave the state as is
        }
      };
      poll();
      const interval = setInterval(poll, DESKTOP_POLL_MS);
      return () => {
        disposed = true;
        clearInterval(interval);
        setUserIdle(false);
        applyPresence(false);
      };
    }

    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), IDLE_AFTER_MS);
    };
    const onActivity = () => {
      setIdle(false);
      arm();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    arm();
    return () => {
      disposed = true;
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      setUserIdle(false);
      applyPresence(false);
    };
  }, [mx, enabled]);

  return null;
}

import { useEffect, useRef } from 'react';
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
 * and reflects it as `unavailable` presence while the user has chosen to be online.
 */
export function IdleDetector() {
  const mx = useMatrixClient();
  const [enabled] = useSetting(settingsAtom, 'idleDetection');
  // The choice, not what the server reports: that is online while any other device is.
  const [chosenPresence] = useSetting(settingsAtom, 'chosenPresence');
  const chosenPresenceRef = useRef(chosenPresence);
  chosenPresenceRef.current = chosenPresence;

  useEffect(() => {
    if (!enabled) return undefined;
    let ownedAway = false;
    let disposed = false;

    const applyPresence = (idle: boolean) => {
      const userId = mx.getUserId();
      if (!userId) return;
      if (idle) {
        if (chosenPresenceRef.current !== 'online' || ownedAway) return;
        // Stays owned when the send fails: the sync already carries away, so coming back must
        // still send online.
        ownedAway = true;
        sendPresence(mx, 'unavailable').catch(() => undefined);
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

    const onActivity = () => setIdle(false);
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
      // The poll alone would leave you away for up to its period after you come back.
      ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
      return () => {
        disposed = true;
        clearInterval(interval);
        ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
        setUserIdle(false);
        applyPresence(false);
      };
    }

    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), IDLE_AFTER_MS);
    };
    const onWindowActivity = () => {
      onActivity();
      arm();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onWindowActivity, { passive: true }));
    arm();
    return () => {
      disposed = true;
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onWindowActivity));
      setUserIdle(false);
      applyPresence(false);
    };
  }, [mx, enabled]);

  return null;
}

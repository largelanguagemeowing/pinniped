import { useCallback, useEffect, useState } from 'react';
import { UpdateStatus } from '../utils/device';

const UNSUPPORTED: UpdateStatus = { state: 'unsupported' };

/**
 * The desktop app's self-update. Reports `unsupported` on the web and on builds that never update
 * themselves, and until the main process has answered.
 */
export const useDesktopUpdater = () => {
  const [status, setStatus] = useState<UpdateStatus>(UNSUPPORTED);

  useEffect(() => {
    const updater = window.pinnipedDesktop?.updater;
    if (!updater) return undefined;
    let alive = true;
    // A change that arrives first is newer than the snapshot still on its way.
    let changed = false;
    const unsubscribe = updater.onStatus((next) => {
      changed = true;
      if (alive) setStatus(next);
    });
    updater
      .getStatus()
      .then((snapshot) => {
        if (alive && !changed) setStatus(snapshot);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const check = useCallback(() => {
    window.pinnipedDesktop?.updater
      ?.check()
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  const install = useCallback(() => {
    window.pinnipedDesktop?.updater?.install().catch(() => undefined);
  }, []);

  return { status, check, install };
};

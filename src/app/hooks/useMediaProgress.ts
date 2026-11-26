import { useCallback, useSyncExternalStore } from 'react';
import { IDLE_PROGRESS, MediaProgressState, mediaProgress } from '../utils/mediaProgress';

const unsubscribed = () => undefined;

/**
 * How far the download of `url` is, whichever component started it. `url` is the address the
 * media is fetched from; `null` (an address that could not be built) is never loading.
 */
export const useMediaProgress = (url: string | null): MediaProgressState =>
  useSyncExternalStore(
    useCallback(
      (listener: () => void) =>
        url === null ? unsubscribed : mediaProgress.subscribe(url, listener),
      [url]
    ),
    () => (url === null ? IDLE_PROGRESS : mediaProgress.get(url))
  );

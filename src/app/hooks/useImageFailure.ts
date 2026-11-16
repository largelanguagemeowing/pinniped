import { useCallback, useState } from 'react';
import { clearFailure, isBackedOff, recordFailure } from '../utils/requestBackoff';

/**
 * Tracks whether an `<img>` failed to load. A failed URL is remembered across remounts with a
 * growing wait, so a list that scrolls its avatars in and out does not request the same broken
 * image every time. A new `src` starts clean.
 */
export const useImageFailure = (src?: string) => {
  const [failedSrc, setFailedSrc] = useState<string>();
  const failed = !!src && (failedSrc === src || isBackedOff(src));

  const onError = useCallback(() => {
    if (!src) return;
    recordFailure(src);
    setFailedSrc(src);
  }, [src]);

  const onLoad = useCallback(() => {
    if (src) clearFailure(src);
  }, [src]);

  return { failed, onError, onLoad };
};

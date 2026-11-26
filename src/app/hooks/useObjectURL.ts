import { useLayoutEffect, useState } from 'react';
import { BlobLease, mediaBlobCache } from '../utils/mediaBlobCache';

// a blob the media cache loaded shares the cache's URL; any other gets one of its own
const holdObjectURL = (object: Blob): BlobLease => {
  const cached = mediaBlobCache.hold(object);
  if (cached) return cached;
  const url = URL.createObjectURL(object);
  return { url, release: () => URL.revokeObjectURL(url) };
};

/**
 * An object URL for `object` while the component shows it. Cached media is held in the media
 * cache for that time and keeps its URL across mounts; the cache revokes it on eviction. The URL
 * of any other blob (a local file) is revoked when the component lets go of it.
 */
export const useObjectURL = (object?: Blob): string | undefined => {
  const [held, setHeld] = useState<{ object: Blob; url: string }>();

  // held in an effect, so a render that never commits takes nothing; a layout effect, so the
  // URL is there before the first paint
  useLayoutEffect(() => {
    if (!object) return undefined;
    const lease = holdObjectURL(object);
    setHeld({ object, url: lease.url });
    return () => {
      lease.release();
      setHeld(undefined);
    };
  }, [object]);

  // the lease of the object shown now; one render after a change still has the previous one
  return held && held.object === object ? held.url : undefined;
};

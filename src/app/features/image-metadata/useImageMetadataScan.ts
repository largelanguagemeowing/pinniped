import { useCallback } from 'react';
import { useMediaLoader } from '../../hooks/useMediaLoader';
import { AsyncState, useAsyncLoad } from '../../hooks/useAsyncCallback';
import { FALLBACK_MIMETYPE } from '../../utils/mimeTypes';
import { ImageAttachment } from './imageAttachment';
import { MetadataScan, scanImageMetadata } from './scanImageMetadata';

/** Downloads (and decrypts) the original file on demand and scans it. */
export const useImageMetadataScan = (
  attachment: ImageAttachment
): [AsyncState<MetadataScan>, () => void] => {
  const { mxc, mimetype, encInfo } = attachment;
  const media = useMediaLoader({ mxc, mimeType: mimetype ?? FALLBACK_MIMETYPE, encInfo }, 'finish');

  return useAsyncLoad<MetadataScan, unknown, []>(
    useCallback(async () => {
      const file = await media.load();
      return scanImageMetadata(new Uint8Array(await file.arrayBuffer()));
    }, [media])
  );
};

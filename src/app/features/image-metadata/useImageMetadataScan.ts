import { useCallback } from 'react';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { AsyncState, useAsyncLoad } from '../../hooks/useAsyncCallback';
import {
  decryptFile,
  downloadEncryptedMedia,
  downloadMedia,
  mxcUrlToHttp,
} from '../../utils/matrix';
import { FALLBACK_MIMETYPE } from '../../utils/mimeTypes';
import { ImageAttachment } from './imageAttachment';
import { MetadataScan, scanImageMetadata } from './scanImageMetadata';

/** Downloads (and decrypts) the original file on demand and scans it. */
export const useImageMetadataScan = (
  attachment: ImageAttachment
): [AsyncState<MetadataScan>, () => void] => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const { mxc, mimetype, encInfo } = attachment;

  return useAsyncLoad<MetadataScan, unknown, []>(
    useCallback(async () => {
      const url = mxcUrlToHttp(mx, mxc, useAuthentication);
      if (!url) throw new Error('Invalid media URL');
      const file = encInfo
        ? await downloadEncryptedMedia(url, (buf) =>
            decryptFile(buf, mimetype ?? FALLBACK_MIMETYPE, encInfo)
          )
        : await downloadMedia(url);
      return scanImageMetadata(new Uint8Array(await file.arrayBuffer()));
    }, [mx, mxc, mimetype, encInfo, useAuthentication])
  );
};

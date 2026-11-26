import React, { ReactNode, useCallback, useEffect } from 'react';
import { IThumbnailContent } from '../../../../types/matrix/common';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { AsyncStatus, useAsyncLoad } from '../../../hooks/useAsyncCallback';
import {
  AttachmentTamperedError,
  AttachmentUnreadableError,
  mxcUrlToHttp,
} from '../../../utils/matrix';
import { loadMedia } from '../../../utils/cachedMedia';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { useObjectURL } from '../../../hooks/useObjectURL';
import { FALLBACK_MIMETYPE } from '../../../utils/mimeTypes';
import { AttachmentLoadError } from './AttachmentLoadError';

export type ThumbnailContentProps = {
  info: IThumbnailContent;
  renderImage: (src: string) => ReactNode;
};
export function ThumbnailContent({ info, renderImage }: ThumbnailContentProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();

  const [thumbSrcState, loadThumbSrc] = useAsyncLoad(
    useCallback(async (): Promise<string | Blob> => {
      const thumbInfo = info.thumbnail_info;
      const thumbMxcUrl = info.thumbnail_file?.url ?? info.thumbnail_url;
      const encInfo = info.thumbnail_file;
      if (typeof thumbMxcUrl !== 'string' || typeof thumbInfo?.mimetype !== 'string') {
        throw new Error('Failed to load thumbnail');
      }

      if (encInfo) {
        return loadMedia(
          mx,
          {
            encrypted: true,
            mxc: thumbMxcUrl,
            info: encInfo,
            mimeType: thumbInfo.mimetype ?? FALLBACK_MIMETYPE,
          },
          { useAuthentication }
        );
      }

      const mediaUrl = mxcUrlToHttp(mx, thumbMxcUrl, useAuthentication);
      if (!mediaUrl) throw new Error('Invalid media URL');
      return mediaUrl;
    }, [mx, info, useAuthentication])
  );

  const loaded = thumbSrcState.status === AsyncStatus.Success ? thumbSrcState.data : undefined;
  const blobUrl = useObjectURL(loaded instanceof Blob ? loaded : undefined);
  const src = typeof loaded === 'string' ? loaded : blobUrl;

  useEffect(() => {
    loadThumbSrc();
  }, [loadThumbSrc]);

  if (src) return renderImage(src);
  // A thumbnail is decoration. A missing or non-mxc one (which the client never fetches) stays
  // silent, so it cannot cover the media's own controls. A tampered or undecryptable thumbnail
  // is still shown, because the user must know it was not displayed.
  if (
    thumbSrcState.status === AsyncStatus.Error &&
    (thumbSrcState.error instanceof AttachmentTamperedError ||
      thumbSrcState.error instanceof AttachmentUnreadableError)
  ) {
    return <AttachmentLoadError error={thumbSrcState.error} onRetry={() => loadThumbSrc()} />;
  }
  return null;
}

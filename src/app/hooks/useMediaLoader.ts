import { useCallback, useEffect, useMemo, useRef } from 'react';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { MediaRequest, loadMedia, mediaHttpUrl } from '../utils/cachedMedia';
import { useMatrixClient } from './useMatrixClient';
import { useMediaAuthentication } from './useMediaAuthentication';

export type MediaLoader = {
  /**
   * Where the media is fetched from, which `useMediaProgress` follows; null for a URI the
   * client does not accept as media.
   */
  httpUrl: string | null;
  /** The whole media through the media cache: `useObjectURL` shows the blob by the cache's URL. */
  load: () => Promise<Blob>;
};

/**
 * Loads the original of an attachment. `whenUnmounted` says what a load still running is worth
 * once the component is gone: media that is only shown is abandoned (the download stops unless
 * another view waits for it), a file being saved or opened finishes.
 */
export const useMediaLoader = (
  attachment: { mxc: string; mimeType: string; encInfo?: EncryptedAttachmentInfo },
  whenUnmounted: 'abandon' | 'finish'
): MediaLoader => {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const { mxc, mimeType, encInfo } = attachment;

  const request = useMemo(
    (): MediaRequest =>
      encInfo
        ? { encrypted: true, mxc, info: encInfo, mimeType }
        : { encrypted: false, mxc, size: { kind: 'original' } },
    [mxc, mimeType, encInfo]
  );

  const running = useRef(new Set<AbortController>());
  useEffect(() => {
    const controllers = running.current;
    return () => controllers.forEach((controller) => controller.abort());
  }, []);

  const load = useCallback(async (): Promise<Blob> => {
    if (whenUnmounted === 'finish') return loadMedia(mx, request, { useAuthentication });
    const controller = new AbortController();
    running.current.add(controller);
    try {
      return await loadMedia(mx, request, { useAuthentication, signal: controller.signal });
    } finally {
      running.current.delete(controller);
    }
  }, [mx, request, useAuthentication, whenUnmounted]);

  const httpUrl = useMemo(
    () => mediaHttpUrl(mx, request, useAuthentication),
    [mx, request, useAuthentication]
  );

  return useMemo(() => ({ httpUrl, load }), [httpUrl, load]);
};

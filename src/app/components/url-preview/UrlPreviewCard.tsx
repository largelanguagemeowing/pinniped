import React, { useCallback, useEffect, useState } from 'react';
import { IPreviewUrlResponse } from 'matrix-js-sdk';
import { Box, as, config, toRem } from 'folds';
import { ImageOverlay } from '../ImageOverlay';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import {
  UrlPreview,
  UrlPreviewAuthor,
  UrlPreviewContent,
  UrlPreviewDescription,
  UrlPreviewImg,
  UrlPreviewProvider,
  UrlPreviewThumbnail,
  UrlPreviewTitle,
} from './UrlPreview';
import { mxcUrlToHttp } from '../../utils/matrix';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { ImageViewer } from '../image-viewer';
import { UrlPreviewPost, isPostPreview } from './UrlPreviewPost';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { getUrlPreview } from '../../utils/urlPreviewServer';
import { onEnterOrSpace } from '../../utils/keyboard';

const LARGE_IMG_MAX_WIDTH = 400;
const LARGE_IMG_MAX_HEIGHT = 300;

const getString = (prev: IPreviewUrlResponse, key: string): string | undefined => {
  const value = prev[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const getNumber = (prev: IPreviewUrlResponse, key: string): number | undefined => {
  const value = Number(prev[key]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

// The homeserver folds the author into og:site_name as "Provider · Author"
// so it can be shown on its own line.
const splitSiteName = (siteName?: string): [string | undefined, string | undefined] => {
  if (!siteName) return [undefined, undefined];
  const [provider, ...rest] = siteName.split(' · ');
  return [provider || undefined, rest.join(' · ') || undefined];
};

// Wide images are shown full-width under the text, square-ish ones (avatars,
// logos) as a small thumbnail beside it.
const isLargeImage = (width?: number, height?: number): boolean =>
  !!width && !!height && width >= 300 && width / height >= 1.2;

const fitLargeImage = (width: number, height: number) => {
  const scale = Math.min(1, LARGE_IMG_MAX_WIDTH / width, LARGE_IMG_MAX_HEIGHT / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

export const UrlPreviewCard = as<'article', { url: string; ts: number }>(
  ({ url, ts, ...props }, ref) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const [viewer, setViewer] = useState(false);
    // 0: thumbnail, 1: full image fallback, 2: give up and hide the image
    const [imgAttempt, setImgAttempt] = useState(0);
    const [previewServer] = useSetting(settingsAtom, 'urlPreviewServer');
    const [previewToken] = useSetting(settingsAtom, 'urlPreviewServerToken');
    const [previewStatus, loadPreview] = useAsyncCallback(
      useCallback(
        () => getUrlPreview(mx, url, ts, previewServer, previewToken),
        [url, ts, mx, previewServer, previewToken]
      )
    );

    useEffect(() => {
      loadPreview();
    }, [loadPreview]);

    // Only render once the preview succeeds. Returning null during loading
    // and on error prevents height changes (loading spinner -> null) that
    // would cause the timeline scroll position to jump.
    if (previewStatus.status !== AsyncStatus.Success) return null;

    const prev = previewStatus.data;
    if (isPostPreview(prev)) return <UrlPreviewPost url={url} prev={prev} {...props} ref={ref} />;

    const title = getString(prev, 'og:title');
    const description = getString(prev, 'og:description');
    const [provider, author] = splitSiteName(getString(prev, 'og:site_name'));
    const imgMxc = getString(prev, 'og:image');
    const imgWidth = getNumber(prev, 'og:image:width');
    const imgHeight = getNumber(prev, 'og:image:height');

    if (!title && !description && !imgMxc) return null;

    const large = isLargeImage(imgWidth, imgHeight);
    const thumbSrc = imgMxc
      ? mxcUrlToHttp(
          mx,
          imgMxc,
          useAuthentication,
          large ? LARGE_IMG_MAX_WIDTH * 2 : 160,
          large ? LARGE_IMG_MAX_HEIGHT * 2 : 160,
          'scale',
          false
        )
      : null;
    const fullImgSrc = imgMxc ? mxcUrlToHttp(mx, imgMxc, useAuthentication) : null;
    let imgSrc: string | null = null;
    if (imgAttempt === 0) imgSrc = thumbSrc ?? fullImgSrc;
    else if (imgAttempt === 1) imgSrc = fullImgSrc;
    const largeSize = large && imgWidth && imgHeight ? fitLargeImage(imgWidth, imgHeight) : null;

    const imgProps = {
      src: imgSrc ?? undefined,
      alt: title ?? '',
      tabIndex: 0,
      onKeyDown: onEnterOrSpace(() => setViewer(true)),
      onClick: () => setViewer(true),
      onError: () => setImgAttempt((n) => (n === 0 && thumbSrc && fullImgSrc ? 1 : 2)),
    };

    return (
      <UrlPreview thumbnail={!!imgSrc && !largeSize} {...props} ref={ref}>
        <UrlPreviewContent>
          {provider && <UrlPreviewProvider>{provider}</UrlPreviewProvider>}
          {author && <UrlPreviewAuthor>{author}</UrlPreviewAuthor>}
          {title && (
            <UrlPreviewTitle href={url} target="_blank" rel="noreferrer noopener">
              {title}
            </UrlPreviewTitle>
          )}
          {description && <UrlPreviewDescription>{description}</UrlPreviewDescription>}
        </UrlPreviewContent>
        {imgSrc &&
          (largeSize ? (
            <UrlPreviewImg
              {...imgProps}
              style={{
                width: toRem(largeSize.width),
                aspectRatio: `${largeSize.width} / ${largeSize.height}`,
              }}
            />
          ) : (
            <UrlPreviewThumbnail {...imgProps} />
          ))}
        {imgSrc && fullImgSrc && (
          <ImageOverlay
            src={fullImgSrc}
            alt={title ?? ''}
            viewer={viewer}
            requestClose={() => setViewer(false)}
            renderViewer={(p) => <ImageViewer {...p} />}
          />
        )}
      </UrlPreview>
    );
  }
);

export const UrlPreviewHolder = as<'div'>(({ style, ...props }, ref) => (
  <Box
    direction="Column"
    alignItems="Start"
    gap="200"
    style={{ marginTop: config.space.S200, ...style }}
    {...props}
    ref={ref}
  />
));

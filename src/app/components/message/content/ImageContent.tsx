import React, { ReactNode, SyntheticEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  Icon,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  Spinner,
  Text,
  Tooltip,
  TooltipProvider,
  as,
} from 'folds';
import classNames from 'classnames';
import { BlurhashCanvas } from 'react-blurhash';
import FocusTrap from 'focus-trap-react';
import { EncryptedAttachmentInfo } from 'browser-encrypt-attachment';
import { IImageInfo, MATRIX_BLUR_HASH_PROPERTY_NAME } from '../../../../types/matrix/common';
import { AsyncStatus, useAsyncLoad } from '../../../hooks/useAsyncCallback';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import * as css from './style.css';
import { bytesToSize } from '../../../utils/common';
import { FALLBACK_MIMETYPE } from '../../../utils/mimeTypes';
import { stopPropagation } from '../../../utils/keyboard';
import { decryptFile, downloadEncryptedMedia, mxcUrlToHttp } from '../../../utils/matrix';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { AttachmentLoadError } from './AttachmentLoadError';
import { validBlurHash } from '../../../utils/blurHash';
import { useHoverPlay } from '../../../hooks/useHoverPlay';
import { StillImage } from '../../media';

type RenderViewerProps = {
  src: string;
  alt: string;
  requestClose: () => void;
};
type RenderImageProps = {
  alt: string;
  title: string;
  src: string;
  onLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
  onError: () => void;
  onClick: () => void;
  tabIndex: number;
};
export type ImageContentProps = {
  body: string;
  mimeType?: string;
  url: string;
  info?: IImageInfo;
  encInfo?: EncryptedAttachmentInfo;
  autoPlay?: boolean;
  markedAsSpoiler?: boolean;
  spoilerReason?: string;
  renderViewer: (props: RenderViewerProps) => ReactNode;
  renderImage: (props: RenderImageProps) => ReactNode;
};
export const ImageContent = as<'div', ImageContentProps>(
  (
    {
      className,
      body,
      mimeType,
      url,
      info,
      encInfo,
      autoPlay: autoPlayProp,
      markedAsSpoiler,
      spoilerReason,
      renderViewer,
      renderImage,
      ...props
    },
    ref
  ) => {
    const mx = useMatrixClient();
    const useAuthentication = useMediaAuthentication();
    const blurHash = validBlurHash(info?.[MATRIX_BLUR_HASH_PROPERTY_NAME]);
    const sizeLabel = typeof info?.size === 'number' ? bytesToSize(info.size) : undefined;

    const [load, setLoad] = useState(false);
    const [loadedImage, setLoadedImage] = useState<HTMLImageElement>();
    const [error, setError] = useState(false);
    const [viewer, setViewer] = useState(false);
    const [blurred, setBlurred] = useState(markedAsSpoiler ?? false);

    // Auto-retry on image load failure (e.g. 401 when the service worker
    // hasn't received the session yet). Retries up to 3 times with a 1s
    // delay before falling back to the manual retry button.
    const [retryCount, setRetryCount] = useState(0);
    const maxRetries = 3;
    const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(
      () => () => {
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      },
      []
    );

    const [srcState, loadSrc] = useAsyncLoad(
      useCallback(async () => {
        const mediaUrl = mxcUrlToHttp(mx, url, useAuthentication);
        if (!mediaUrl) throw new Error('Invalid media URL');
        if (encInfo) {
          const fileContent = await downloadEncryptedMedia(mediaUrl, (encBuf) =>
            decryptFile(encBuf, mimeType ?? FALLBACK_MIMETYPE, encInfo)
          );
          return URL.createObjectURL(fileContent);
        }
        return mediaUrl;
      }, [mx, url, useAuthentication, mimeType, encInfo])
    );

    // `is_animated` is the sender's claim; it only decides the badge and pausing, so it is not verified
    const animated = info?.is_animated === true;
    const { lowAnimationMode, hovered, hoverProps } = useHoverPlay();
    const stillSource = animated && lowAnimationMode && !hovered ? loadedImage : undefined;
    const paused = stillSource !== undefined;

    const animatedBadge = animated && (!load || paused);
    const sizeBadge = !load && sizeLabel !== undefined;

    const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
      setLoad(true);
      setLoadedImage(event.currentTarget);
    };
    const handleError = () => {
      setLoad(false);
      if (retryCount < maxRetries) {
        retryTimerRef.current = setTimeout(() => {
          setRetryCount((c) => c + 1);
          loadSrc();
        }, 1000);
      } else {
        setError(true);
      }
    };

    const handleRetry = () => {
      setError(false);
      setRetryCount(0);
      loadSrc();
    };

    useEffect(() => {
      if (autoPlayProp ?? true) loadSrc();
    }, [autoPlayProp, loadSrc]);

    return (
      <Box className={classNames(css.RelativeBase, className)} {...hoverProps} {...props} ref={ref}>
        {srcState.status === AsyncStatus.Success && (
          <Overlay open={viewer} backdrop={<OverlayBackdrop />}>
            <OverlayCenter>
              <FocusTrap
                focusTrapOptions={{
                  initialFocus: false,
                  onDeactivate: () => setViewer(false),
                  clickOutsideDeactivates: true,
                  escapeDeactivates: stopPropagation,
                }}
              >
                {renderViewer({
                  src: srcState.data,
                  alt: body,
                  requestClose: () => setViewer(false),
                })}
              </FocusTrap>
            </OverlayCenter>
          </Overlay>
        )}
        {typeof blurHash === 'string' && !load && (
          <BlurhashCanvas
            style={{ width: '100%', height: '100%' }}
            width={32}
            height={32}
            hash={blurHash}
            punch={1}
          />
        )}
        {!autoPlayProp && !markedAsSpoiler && srcState.status === AsyncStatus.Idle && (
          <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
            <Button
              variant="Secondary"
              fill="Solid"
              radii="300"
              size="300"
              onClick={loadSrc}
              before={<Icon size="Inherit" src={Icons.Photo} filled />}
            >
              <Text size="B300">View</Text>
            </Button>
          </Box>
        )}
        {stillSource && (
          <Box
            className={classNames(css.AbsoluteContainer, blurred && css.Blur)}
            style={{ pointerEvents: 'none' }}
          >
            <StillImage source={stillSource} />
          </Box>
        )}
        {srcState.status === AsyncStatus.Success && (
          // hidden by opacity while paused, so it stays clickable and focusable
          <Box
            className={classNames(css.AbsoluteContainer, blurred && css.Blur)}
            style={paused ? { opacity: 0 } : undefined}
          >
            {renderImage({
              alt: body,
              title: body,
              src: srcState.data,
              onLoad: handleLoad,
              onError: handleError,
              onClick: () => setViewer(true),
              tabIndex: 0,
            })}
          </Box>
        )}
        {blurred && !error && srcState.status !== AsyncStatus.Error && (
          <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
            <TooltipProvider
              tooltip={
                typeof spoilerReason === 'string' && (
                  <Tooltip variant="Secondary">
                    <Text>{spoilerReason}</Text>
                  </Tooltip>
                )
              }
              position="Top"
              align="Center"
            >
              {(triggerRef) => (
                <Chip
                  ref={triggerRef}
                  variant="Secondary"
                  radii="Pill"
                  size="500"
                  outlined
                  onClick={() => {
                    setBlurred(false);
                    if (srcState.status === AsyncStatus.Idle) {
                      loadSrc();
                    }
                  }}
                >
                  <Text size="B300">Spoiler</Text>
                </Chip>
              )}
            </TooltipProvider>
          </Box>
        )}
        {(srcState.status === AsyncStatus.Loading || srcState.status === AsyncStatus.Success) &&
          !load &&
          !blurred && (
            <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
              <Spinner variant="Secondary" />
            </Box>
          )}
        {(error || srcState.status === AsyncStatus.Error) && (
          <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
            <AttachmentLoadError
              error={srcState.status === AsyncStatus.Error ? srcState.error : undefined}
              onRetry={handleRetry}
              size="300"
            />
          </Box>
        )}
        {(animatedBadge || sizeBadge) && (
          <Box className={css.AbsoluteFooter} justifyContent="End" alignContent="Center" gap="200">
            {animatedBadge && (
              <Badge variant="Secondary" fill="Soft">
                <Text size="L400">GIF</Text>
              </Badge>
            )}
            {sizeBadge && (
              <Badge variant="Secondary" fill="Soft">
                <Text size="L400">{sizeLabel}</Text>
              </Badge>
            )}
          </Box>
        )}
      </Box>
    );
  }
);

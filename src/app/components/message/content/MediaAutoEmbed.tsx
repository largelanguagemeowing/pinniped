import React, { useEffect, useState } from 'react';
import { Box, Button, Icon, Icons, Spinner, Text, Tooltip, TooltipProvider, toRem } from 'folds';
import { ImageOverlay } from '../../ImageOverlay';
import { ImageViewer } from '../../image-viewer';
import { Image, Video } from '../../media';
import { Attachment, AttachmentBox } from '../attachment';
import { fitWithin } from '../../../utils/common';
import { onEnterOrSpace } from '../../../utils/keyboard';
import * as css from './style.css';

const MAX_WIDTH = 400;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 300;

const IMAGE_EXTENSIONS = new Set(['gif', 'png', 'jpg', 'jpeg', 'webp', 'avif']);

// The file is loaded by the <img>/<video> element itself, not fetched. A fetch would
// need the host to send CORS headers, and most file hosts do not.
const getEmbedKind = (url: string): 'image' | 'video' => {
  try {
    const ext = new URL(url).pathname.split('.').pop()?.toLowerCase();
    return ext !== undefined && IMAGE_EXTENSIONS.has(ext) ? 'image' : 'video';
  } catch {
    return 'video';
  }
};

type EmbedStatus = 'idle' | 'loading' | 'ready' | 'error';

export type MediaAutoEmbedProps = {
  url: string;
  autoLoad?: boolean;
};

export function MediaAutoEmbed({ url, autoLoad = true }: MediaAutoEmbedProps) {
  const kind = getEmbedKind(url);
  const [status, setStatus] = useState<EmbedStatus>(autoLoad ? 'loading' : 'idle');
  // Changing the attempt remounts the element, which starts the load again.
  const [attempt, setAttempt] = useState(0);
  const [viewer, setViewer] = useState(false);
  const [width, setWidth] = useState(MAX_WIDTH);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  useEffect(() => {
    if (autoLoad) setStatus((current) => (current === 'idle' ? 'loading' : current));
  }, [autoLoad]);

  const startLoad = () => {
    setStatus('loading');
    setAttempt((current) => current + 1);
  };

  const updateDimensions = (mediaWidth: number, mediaHeight: number) => {
    if (!mediaWidth || !mediaHeight) return;
    const [nextWidth, nextHeight] = fitWithin(mediaWidth, mediaHeight, MAX_WIDTH, MAX_HEIGHT);
    setWidth(Math.max(nextWidth, 48));
    setHeight(Math.max(nextHeight, 48));
  };

  const mounted = status === 'loading' || status === 'ready';

  return (
    <Attachment style={{ width: toRem(width) }}>
      <AttachmentBox style={{ width: toRem(width), height: toRem(height) }}>
        <Box className={css.RelativeBase}>
          {mounted &&
            (kind === 'image' ? (
              <Box className={css.AbsoluteContainer}>
                <Image
                  key={attempt}
                  src={url}
                  alt="Embedded image"
                  title={url}
                  loading="lazy"
                  tabIndex={0}
                  onLoad={(event) => {
                    setStatus('ready');
                    updateDimensions(
                      event.currentTarget.naturalWidth,
                      event.currentTarget.naturalHeight
                    );
                  }}
                  onError={() => setStatus('error')}
                  onKeyDown={(event) => onEnterOrSpace(() => setViewer(true))(event)}
                  onClick={() => setViewer(true)}
                />
                <ImageOverlay
                  src={url}
                  alt="Embedded image"
                  viewer={viewer}
                  requestClose={() => setViewer(false)}
                  renderViewer={(props) => <ImageViewer {...props} />}
                />
              </Box>
            ) : (
              <Box className={css.AbsoluteContainer}>
                <Video
                  key={attempt}
                  src={url}
                  title={url}
                  aria-label="Embedded video"
                  controls
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(event) => {
                    setStatus('ready');
                    updateDimensions(
                      event.currentTarget.videoWidth,
                      event.currentTarget.videoHeight
                    );
                  }}
                  onError={() => setStatus('error')}
                />
              </Box>
            ))}
          {status === 'loading' && (
            <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
              <Spinner variant="Secondary" />
            </Box>
          )}
          {status === 'idle' && (
            <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
              <Button
                variant="Secondary"
                fill="Solid"
                radii="300"
                size="300"
                onClick={startLoad}
                before={<Icon size="Inherit" src={Icons.Play} filled />}
              >
                <Text size="B300">Load media</Text>
              </Button>
            </Box>
          )}
          {status === 'error' && (
            <Box className={css.AbsoluteContainer} alignItems="Center" justifyContent="Center">
              <TooltipProvider
                tooltip={
                  <Tooltip variant="Critical">
                    <Text>Failed to load media!</Text>
                  </Tooltip>
                }
                position="Top"
                align="Center"
              >
                {(triggerRef) => (
                  <Button
                    ref={triggerRef}
                    size="300"
                    variant="Critical"
                    fill="Soft"
                    outlined
                    radii="300"
                    onClick={startLoad}
                    before={<Icon size="Inherit" src={Icons.Warning} filled />}
                  >
                    <Text size="B300">Retry</Text>
                  </Button>
                )}
              </TooltipProvider>
            </Box>
          )}
        </Box>
      </AttachmentBox>
    </Attachment>
  );
}

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */
import React, { useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import FileSaver from 'file-saver';
import classNames from 'classnames';
import { Box, Chip, Header, Icon, IconButton, Icons, Text, as } from 'folds';
import * as css from './ImageViewer.css';
import { AsyncStatus, useAsyncLoad } from '../../hooks/useAsyncCallback';
import { useZoom } from '../../hooks/useZoom';
import { usePan } from '../../hooks/usePan';
import { useMagnifier } from '../../hooks/useMagnifier';
import { downloadMedia } from '../../utils/matrix';

export type ImageViewerProps = {
  alt: string;
  src: string;
  requestClose: () => void;
};

// Clicking the image or the header should not close the viewer (only
// the dark area around the image does). Stop the event from bubbling to the
// root's onClick={requestClose}.
// The root also uses it for onContextMenu: React events bubble through
// portals along the component tree, so a right-click inside the viewer would
// otherwise reach the owning message and open its context menu (a second
// focus trap) behind the viewer, leaving the page unresponsive.
const stopMousePropagation = (e: React.MouseEvent) => {
  e.stopPropagation();
};

export const ImageViewer = as<'div', ImageViewerProps>(
  ({ className, alt, src, requestClose, ...props }, ref) => {
    const { zoom, zoomIn, zoomOut, setZoom } = useZoom(0.2);
    const { pan, cursor, onMouseDown } = usePan(zoom !== 1);

    const imgRef = useRef<HTMLImageElement>(null);
    // Vencord-style magnifier lens. Active only at fit-to-screen (zoom === 1);
    // pan takes over once the image is persistently zoomed via the header.
    const magnifier = useMagnifier(imgRef, zoom === 1);

    const [downloadState, download] = useAsyncLoad(
      useCallback(async () => {
        FileSaver.saveAs(await downloadMedia(src), alt);
      }, [src, alt])
    );
    const downloadFailed = downloadState.status === AsyncStatus.Error;

    return (
      <Box
        className={classNames(css.ImageViewer, className)}
        direction="Column"
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          requestClose();
        }}
        onContextMenu={stopMousePropagation}
        {...props}
        ref={ref}
      >
        <Header className={css.ImageViewerHeader} size="400" onClick={stopMousePropagation}>
          <Box grow="Yes" alignItems="Center" gap="200">
            <IconButton size="300" radii="300" onClick={requestClose}>
              <Icon size="50" src={Icons.ArrowLeft} />
            </IconButton>
            <Text size="T300" truncate>
              {alt}
            </Text>
          </Box>
          <Box shrink="No" alignItems="Center" gap="200">
            <IconButton
              variant={zoom < 1 ? 'Success' : 'SurfaceVariant'}
              outlined={zoom < 1}
              size="300"
              radii="Pill"
              onClick={zoomOut}
              aria-label="Zoom Out"
            >
              <Icon size="50" src={Icons.Minus} />
            </IconButton>
            <Chip variant="SurfaceVariant" radii="Pill" onClick={() => setZoom(zoom === 1 ? 2 : 1)}>
              <Text size="B300">{Math.round(zoom * 100)}%</Text>
            </Chip>
            <IconButton
              variant={zoom > 1 ? 'Success' : 'SurfaceVariant'}
              outlined={zoom > 1}
              size="300"
              radii="Pill"
              onClick={zoomIn}
              aria-label="Zoom In"
            >
              <Icon size="50" src={Icons.Plus} />
            </IconButton>
            <Chip
              variant={downloadFailed ? 'Critical' : 'Primary'}
              onClick={download}
              disabled={downloadState.status === AsyncStatus.Loading}
              radii="300"
              before={<Icon size="50" src={Icons.Download} />}
            >
              <Text size="B300">{downloadFailed ? 'Retry Download' : 'Download'}</Text>
            </Chip>
          </Box>
        </Header>
        <Box
          grow="Yes"
          className={css.ImageViewerContent}
          justifyContent="Center"
          alignItems="Center"
        >
          <img
            ref={imgRef}
            className={css.ImageViewerImg}
            style={{
              cursor: zoom === 1 ? 'zoom-in' : cursor,
              transform: `scale(${zoom}) translate(${pan.translateX}px, ${pan.translateY}px)`,
            }}
            src={src}
            alt={alt}
            onMouseDown={onMouseDown}
            onClick={stopMousePropagation}
            draggable={false}
          />
        </Box>
        {magnifier.visible &&
          magnifier.boxSize.x > 0 &&
          createPortal(
            <div
              className={css.MagnifierLens}
              aria-hidden
              style={{
                width: magnifier.size,
                height: magnifier.size,
                transform: `translate(${magnifier.lensPos.x}px, ${magnifier.lensPos.y}px)`,
              }}
            >
              <img
                className={css.MagnifierImg}
                src={src}
                alt=""
                draggable={false}
                style={{
                  width: magnifier.boxSize.x * magnifier.zoom,
                  height: magnifier.boxSize.y * magnifier.zoom,
                  transform: `translate(${magnifier.imgPos.x}px, ${magnifier.imgPos.y}px)`,
                }}
              />
            </div>,
            document.body
          )}
      </Box>
    );
  }
);

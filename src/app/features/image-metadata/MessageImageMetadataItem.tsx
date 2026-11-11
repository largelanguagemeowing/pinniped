import React, { useEffect, useMemo, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { Icon, Icons, MenuItem, Modal, Overlay, OverlayBackdrop, OverlayCenter, Text } from 'folds';
import { MatrixEvent } from 'matrix-js-sdk';
import { AsyncStatus } from '../../hooks/useAsyncCallback';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { stopPropagation } from '../../utils/keyboard';
import * as messageCss from '../room/message/styles.css';
import { ImageAttachment, imageAttachment } from './imageAttachment';
import { ImageMetadataViewer } from './ImageMetadataViewer';
import { useImageMetadataScan } from './useImageMetadataScan';

type ImageMetadataItemProps = { attachment: ImageAttachment; onClose: () => void };

function ImageMetadataItem({ attachment, onClose }: ImageMetadataItemProps) {
  const [mediaAutoLoad] = useSetting(settingsAtom, 'mediaAutoLoad');
  const [scan, startScan] = useImageMetadataScan(attachment);
  const [open, setOpen] = useState(false);

  // With automatic media loading the timeline has fetched the image already, so it is scanned
  // as the menu opens and the item only shows up when there is something to show. Otherwise
  // nothing is downloaded until the item is clicked.
  useEffect(() => {
    if (mediaAutoLoad) startScan();
  }, [mediaAutoLoad, startScan]);

  const found = scan.status === AsyncStatus.Success && scan.data.status === 'found';
  if (mediaAutoLoad && !found) return null;

  const handleOpen = () => {
    if (scan.status === AsyncStatus.Idle) startScan();
    setOpen(true);
  };
  const handleClose = () => {
    setOpen(false);
    onClose();
  };

  return (
    <>
      <Overlay open={open} backdrop={<OverlayBackdrop />}>
        <OverlayCenter>
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: handleClose,
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Modal variant="Surface" size="500">
              <ImageMetadataViewer scan={scan} requestClose={handleClose} />
            </Modal>
          </FocusTrap>
        </OverlayCenter>
      </Overlay>
      <MenuItem
        size="300"
        after={<Icon size="100" src={found ? Icons.Warning : Icons.Info} />}
        radii="300"
        onClick={handleOpen}
        aria-pressed={open}
      >
        <Text className={messageCss.MessageMenuItemText} as="span" size="T300" truncate>
          Show EXIF
        </Text>
      </MenuItem>
    </>
  );
}

/** Opens the metadata of an image message; renders nothing for other messages. */
export function MessageImageMetadataItem({
  mEvent,
  onClose,
}: {
  mEvent: MatrixEvent;
  onClose: () => void;
}) {
  const attachment = useMemo(() => imageAttachment(mEvent.getContent()), [mEvent]);
  if (!attachment) return null;
  return <ImageMetadataItem attachment={attachment} onClose={onClose} />;
}

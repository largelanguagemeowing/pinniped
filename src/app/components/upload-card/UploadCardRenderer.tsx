import React, { useEffect } from 'react';
import { Box, Icon, IconButton, Icons, ProgressBar, Text, color } from 'folds';
import * as css from './UploadCard.css';
import { UploadCardError } from './UploadCard';
import { UploadStatus, UploadSuccess, useBindUploadAtom } from '../../state/upload';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { TUploadContent } from '../../utils/matrix';
import { bytesToSize, getFileTypeIcon } from '../../utils/common';
import {
  roomUploadAtomFamily,
  TUploadItem,
  TUploadMetadata,
} from '../../state/room/roomInputDrafts';
import { useObjectURL } from '../../hooks/useObjectURL';
import { useMediaConfig } from '../../hooks/useMediaConfig';

type PreviewMediaProps = {
  fileItem: TUploadItem;
};
function PreviewMedia({ fileItem }: PreviewMediaProps) {
  const { originalFile, metadata } = fileItem;
  const fileUrl = useObjectURL(originalFile);
  if (!fileUrl) return null;

  const style = {
    filter: metadata.markedAsSpoiler ? 'blur(22px)' : undefined,
  };
  if (originalFile.type.startsWith('video')) {
    return <video className={css.UploadTileMedia} style={style} src={fileUrl} muted />;
  }
  return (
    <img className={css.UploadTileMedia} style={style} alt={originalFile.name} src={fileUrl} />
  );
}

type UploadCardRendererProps = {
  isEncrypted?: boolean;
  fileItem: TUploadItem;
  setMetadata: (fileItem: TUploadItem, metadata: TUploadMetadata) => void;
  onRemove: (file: TUploadContent) => void;
  onComplete?: (upload: UploadSuccess) => void;
};
export function UploadCardRenderer({
  isEncrypted,
  fileItem,
  setMetadata,
  onRemove,
  onComplete,
}: UploadCardRendererProps) {
  const mx = useMatrixClient();
  const mediaConfig = useMediaConfig();
  const allowSize = mediaConfig['m.upload.size'] || Infinity;

  const uploadAtom = roomUploadAtomFamily(fileItem.file);
  const { metadata } = fileItem;
  const { upload, startUpload, cancelUpload } = useBindUploadAtom(mx, uploadAtom, isEncrypted);
  const { file } = upload;
  const fileSizeExceeded = file.size >= allowSize;

  if (upload.status === UploadStatus.Idle && !fileSizeExceeded) {
    startUpload();
  }

  const isMedia =
    fileItem.originalFile.type.startsWith('image') ||
    fileItem.originalFile.type.startsWith('video');

  const handleSpoiler = () => {
    setMetadata(fileItem, { ...metadata, markedAsSpoiler: !metadata.markedAsSpoiler });
  };

  const removeUpload = () => {
    cancelUpload();
    onRemove(file);
  };

  useEffect(() => {
    if (upload.status === UploadStatus.Success) {
      onComplete?.(upload);
    }
  }, [upload, onComplete]);

  return (
    <Box className={css.UploadTile} direction="Column" gap="100">
      <Box className={css.UploadTileFrame}>
        {isMedia ? (
          <PreviewMedia fileItem={fileItem} />
        ) : (
          <Icon src={getFileTypeIcon(Icons, file.type)} size="400" />
        )}
        {upload.status === UploadStatus.Loading && (
          <Box className={css.UploadTileProgress}>
            <ProgressBar
              variant="Secondary"
              size="300"
              min={0}
              max={file.size}
              value={upload.progress.loaded}
            />
          </Box>
        )}
        {upload.status === UploadStatus.Success && (
          <Box className={css.UploadTileDone}>
            <Icon style={{ color: color.Success.Main }} src={Icons.Check} size="100" />
          </Box>
        )}
        <Box className={css.UploadTileActions}>
          {isMedia && upload.status !== UploadStatus.Error && (
            <IconButton
              onClick={handleSpoiler}
              aria-label="Mark as spoiler"
              aria-pressed={metadata.markedAsSpoiler}
              variant={metadata.markedAsSpoiler ? 'Warning' : 'SurfaceVariant'}
              radii="300"
              size="300"
            >
              <Icon src={Icons.EyeBlind} size="100" />
            </IconButton>
          )}
          {upload.status === UploadStatus.Error && (
            <IconButton
              onClick={startUpload}
              aria-label="Retry Upload"
              variant="SurfaceVariant"
              radii="300"
              size="300"
            >
              <Icon src={Icons.Reload} size="100" />
            </IconButton>
          )}
          <IconButton
            onClick={removeUpload}
            aria-label="Remove File"
            variant="Critical"
            radii="300"
            size="300"
          >
            <Icon src={Icons.Delete} size="100" />
          </IconButton>
        </Box>
      </Box>
      <Text size="T300" truncate title={file.name}>
        {file.name}
      </Text>
      {upload.status === UploadStatus.Error && (
        <UploadCardError>
          <Text size="T200">{upload.error.message}</Text>
        </UploadCardError>
      )}
      {upload.status === UploadStatus.Idle && fileSizeExceeded && (
        <UploadCardError>
          <Text size="T200">
            Exceeds the limit of <b>{bytesToSize(allowSize)}</b>.
          </Text>
        </UploadCardError>
      )}
    </Box>
  );
}

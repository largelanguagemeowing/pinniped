import React, { useCallback, useEffect, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import {
  Box,
  Button,
  Dialog,
  Header,
  Icon,
  IconButton,
  Icons,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
  ProgressBar,
  Spinner,
  Text,
  color,
  config,
} from 'folds';
import { Room } from 'matrix-js-sdk';
import { useSetAtom } from 'jotai';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../../hooks/useMediaAuthentication';
import { stopPropagation } from '../../../utils/keyboard';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import {
  ExportPreview,
  ExportProgress,
  ExportSummary,
  exportChat,
  prepareExport,
} from './exportChat';
import { ChatExportError } from './chatExport';
import { roomIdToExportSelectionAtomFamily } from '../../../state/room/roomExport';

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

const describeProgress = (progress: ExportProgress): string => {
  if (progress.stage === 'packing') return 'Packing zip archive...';
  if (progress.total === 0) return 'Preparing archive...';
  return `Downloading images ${progress.done}/${progress.total}...`;
};

type ExportChatDialogProps = {
  room: Room;
  startEventId: string;
  endEventId: string;
  requestClose: () => void;
};

export function ExportChatDialog({
  room,
  startEventId,
  endEventId,
  requestClose,
}: ExportChatDialogProps) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const setSelection = useSetAtom(roomIdToExportSelectionAtomFamily(room.roomId));
  const [progress, setProgress] = useState<ExportProgress>();

  const [previewState, prepare] = useAsyncCallback<ExportPreview, ChatExportError, []>(
    useCallback(
      () => prepareExport(mx, room, startEventId, endEventId),
      [mx, room, startEventId, endEventId]
    )
  );

  useEffect(() => {
    prepare();
  }, [prepare]);

  const [exportState, runExport] = useAsyncCallback<ExportSummary, Error, [ExportPreview]>(
    useCallback(
      (preview) =>
        exportChat({
          mx,
          room,
          preview,
          startEventId,
          endEventId,
          useAuthentication,
          onProgress: setProgress,
        }),
      [mx, room, startEventId, endEventId, useAuthentication]
    )
  );

  const exporting = exportState.status === AsyncStatus.Loading;
  const busy = exporting || previewState.status === AsyncStatus.Loading;

  const handleClose = () => {
    if (busy) return;
    requestClose();
  };

  const handleClearSelection = () => {
    setSelection({});
    requestClose();
  };

  const renderError = (message: string) => (
    <Box direction="Column" gap="400">
      <Text priority="400" style={{ color: color.Critical.Main }}>
        {message}
      </Text>
      <Button variant="Secondary" fill="Soft" onClick={handleClearSelection}>
        <Text size="B400">Select Range Again</Text>
      </Button>
    </Box>
  );

  const renderBody = () => {
    if (previewState.status === AsyncStatus.Error) {
      return renderError(previewState.error.message);
    }
    if (exportState.status === AsyncStatus.Success) {
      const summary = exportState.data;
      return (
        <Box direction="Column" gap="300">
          <Text priority="400">
            Saved {plural(summary.messages, 'message')} and {plural(summary.images, 'image')} to{' '}
            <b>{summary.fileName}</b>.
          </Text>
          {summary.failedImages > 0 && (
            <Text priority="400" style={{ color: color.Warning.Main }}>
              {plural(summary.failedImages, 'image')} could not be downloaded. messages.json lists
              the errors.
            </Text>
          )}
          <Box justifyContent="End">
            <Button variant="Primary" onClick={handleClearSelection}>
              <Text size="B400">Done</Text>
            </Button>
          </Box>
        </Box>
      );
    }

    const preview = previewState.status === AsyncStatus.Success ? previewState.data : undefined;
    const { messages, images } = preview?.summary ?? { messages: 0, images: 0 };

    return (
      <Box direction="Column" gap="400">
        {preview ? (
          <Box direction="Column" gap="200">
            <Text priority="400">
              {plural(messages, 'message')}
              {images > 0 ? ` and ${plural(images, 'image')}` : ''} will be saved as a zip archive.
            </Text>
            <Text size="T300" priority="300">
              Messages go to messages.json, images to files/.
            </Text>
          </Box>
        ) : (
          <Text priority="400">Reading the selected range...</Text>
        )}
        {exporting && progress && (
          <Box direction="Column" gap="100">
            <ProgressBar
              variant="Secondary"
              size="300"
              min={0}
              max={progress.stage === 'downloading' ? Math.max(progress.total, 1) : 1}
              value={progress.stage === 'downloading' ? progress.done : 0}
            />
            <Text size="T200" priority="300">
              {describeProgress(progress)}
            </Text>
          </Box>
        )}
        {exportState.status === AsyncStatus.Error && (
          <Text priority="400" style={{ color: color.Critical.Main }}>
            Export failed: {exportState.error.message}
          </Text>
        )}
        <Box gap="200" alignItems="Center">
          <Button
            variant="Primary"
            onClick={() => !busy && preview && runExport(preview)}
            before={
              busy ? (
                <Spinner fill="Solid" variant="Primary" size="200" />
              ) : (
                <Icon size="100" src={Icons.Download} />
              )
            }
            aria-disabled={busy || !preview}
          >
            <Text size="B400">{exporting ? 'Exporting...' : 'Download Zip'}</Text>
          </Button>
          <Button variant="Secondary" fill="None" onClick={handleClearSelection} disabled={busy}>
            <Text size="B400">Cancel</Text>
          </Button>
        </Box>
      </Box>
    );
  };

  return (
    <FocusTrap
      focusTrapOptions={{
        initialFocus: false,
        onDeactivate: handleClose,
        clickOutsideDeactivates: true,
        escapeDeactivates: stopPropagation,
      }}
    >
      <Dialog variant="Surface">
        <Header
          style={{
            padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
            borderBottomWidth: config.borderWidth.B300,
          }}
          variant="Surface"
          size="500"
        >
          <Box grow="Yes">
            <Text size="H4">Export Chat</Text>
          </Box>
          <IconButton size="300" onClick={handleClose} radii="300" disabled={busy}>
            <Icon src={Icons.Cross} />
          </IconButton>
        </Header>
        <Box style={{ padding: config.space.S400 }} direction="Column" gap="400">
          {renderBody()}
        </Box>
      </Dialog>
    </FocusTrap>
  );
}

type ExportChatOverlayProps = {
  room: Room;
  startEventId: string;
  endEventId: string;
  requestClose: () => void;
};

export function ExportChatOverlay({
  room,
  startEventId,
  endEventId,
  requestClose,
}: ExportChatOverlayProps) {
  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <ExportChatDialog
          room={room}
          startEventId={startEventId}
          endEventId={endEventId}
          requestClose={requestClose}
        />
      </OverlayCenter>
    </Overlay>
  );
}

import React, { MutableRefObject, useImperativeHandle, useRef } from 'react';
import { Box, Text, as, config } from 'folds';
import { useAtomValue } from 'jotai';
import classNames from 'classnames';
import { IContent } from 'matrix-js-sdk';

import * as css from './UploadBoard.css';
import { TUploadFamilyObserverAtom, UploadStatus, UploadSuccess } from '../../state/upload';
import { UploadCardProgress } from '../upload-card/UploadCard';
import { UploadTotals } from '../../features/room/uploadProgress';

export const UploadBoard = as<'div'>(({ children, ...props }, ref) => (
  <Box className={css.UploadBoardBase} {...props} ref={ref}>
    <Box className={css.UploadBoardContainer} justifyContent="End">
      <Box className={css.UploadBoard} direction="Column">
        {children}
      </Box>
    </Box>
  </Box>
));

export type UploadBoardImperativeHandlers = {
  handleSend: (caption?: IContent) => Promise<void>;
};

type UploadBoardSenderProps = {
  uploadFamilyObserverAtom: TUploadFamilyObserverAtom;
  onSend: (uploads: UploadSuccess[], caption?: IContent) => Promise<void>;
  imperativeHandlerRef: MutableRefObject<UploadBoardImperativeHandlers | undefined>;
};

/**
 * Registers the send handler that the composer calls when it sends. The
 * composer's own send action is the only way to send files, so nothing is
 * rendered here.
 */
export function UploadBoardSender({
  uploadFamilyObserverAtom,
  onSend,
  imperativeHandlerRef,
}: UploadBoardSenderProps) {
  const sendingRef = useRef(false);
  const uploads = useAtomValue(uploadFamilyObserverAtom);

  const handleSend = async (caption?: IContent) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    await onSend(
      uploads.filter((upload) => upload.status === UploadStatus.Success) as UploadSuccess[],
      caption
    );
    sendingRef.current = false;
  };

  useImperativeHandle(imperativeHandlerRef, () => ({ handleSend }));

  return null;
}

export const UploadBoardContent = as<'div'>(({ className, children, ...props }, ref) => (
  <div className={classNames(css.UploadBoardContent, className)} {...props} ref={ref}>
    {children}
  </div>
));

type UploadBoardProgressProps = {
  totals: UploadTotals;
};
/** One figure for all the files together, shown while any of them is still on its way. */
export function UploadBoardProgress({ totals }: UploadBoardProgressProps) {
  if (totals.done === totals.count) return null;
  return (
    <Box
      direction="Column"
      gap="100"
      style={{ padding: `${config.space.S200} ${config.space.S200} 0` }}
    >
      <Text size="T200" priority="300">
        {`${totals.done} of ${totals.count} files uploaded`}
      </Text>
      <UploadCardProgress sentBytes={totals.loadedBytes} totalBytes={totals.totalBytes} />
    </Box>
  );
}

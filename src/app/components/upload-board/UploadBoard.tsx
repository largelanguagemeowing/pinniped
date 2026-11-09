import React, { MutableRefObject, useImperativeHandle, useRef } from 'react';
import { Box, as } from 'folds';
import { useAtomValue } from 'jotai';
import classNames from 'classnames';
import { IContent } from 'matrix-js-sdk';

import * as css from './UploadBoard.css';
import { TUploadFamilyObserverAtom, UploadStatus, UploadSuccess } from '../../state/upload';

export const UploadBoard = as<'div'>(({ children, ...props }, ref) => (
  <Box className={css.UploadBoardBase} {...props} ref={ref}>
    <Box className={css.UploadBoardContainer} justifyContent="End">
      <Box className={css.UploadBoard} direction="Column">
        {children}
      </Box>
    </Box>
  </Box>
));

export type UploadBoardImperativeHandlers = { handleSend: (caption?: IContent) => Promise<void> };

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

  useImperativeHandle(imperativeHandlerRef, () => ({
    handleSend,
  }));

  return null;
}

export const UploadBoardContent = as<'div'>(({ className, children, ...props }, ref) => (
  <div className={classNames(css.UploadBoardContent, className)} {...props} ref={ref}>
    {children}
  </div>
));

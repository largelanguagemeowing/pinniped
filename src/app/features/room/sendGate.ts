import { ComposerTileStatus, TComposerTile } from '../../state/room/composerTiles';
import { Upload, UploadStatus } from '../../state/upload';

/**
 * Whether the composer can send its files now. The caption, the files and the reply go out
 * together, so sending while a file is still on its way would leave that file behind.
 */
export type SendGate =
  | { kind: 'ready' }
  | { kind: 'preparing'; count: number }
  | { kind: 'uploading'; count: number }
  /** Files are in the composer but none can be sent; they must be retried or removed. */
  | { kind: 'nothing-ready' };

export const getSendGate = (tiles: TComposerTile[], uploads: Upload[]): SendGate => {
  if (tiles.length === 0) return { kind: 'ready' };

  const preparing = tiles.filter((tile) => tile.status === ComposerTileStatus.Preparing).length;
  if (preparing > 0) return { kind: 'preparing', count: preparing };

  // A ready file starts uploading as soon as its tile is shown, so Idle is a moment, not a state
  // a file stays in.
  const uploading = uploads.filter(
    (upload) => upload.status === UploadStatus.Idle || upload.status === UploadStatus.Loading
  ).length;
  if (uploading > 0) return { kind: 'uploading', count: uploading };

  if (!uploads.some((upload) => upload.status === UploadStatus.Success)) {
    return { kind: 'nothing-ready' };
  }
  return { kind: 'ready' };
};

const files = (count: number) => (count === 1 ? '1 file' : `${count} files`);

/** Why the send waits, or undefined when it does not. */
export const describeSendGate = (gate: SendGate): string | undefined => {
  switch (gate.kind) {
    case 'preparing':
      return `Preparing ${files(gate.count)}, then it can be sent.`;
    case 'uploading':
      return `Uploading ${files(gate.count)}, then it can be sent.`;
    case 'nothing-ready':
      return 'No file can be sent. Retry or remove the failed files.';
    default:
      return undefined;
  }
};

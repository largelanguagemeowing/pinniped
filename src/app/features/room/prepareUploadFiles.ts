import { encryptFile } from '../../utils/matrix';
import { safeFile } from '../../utils/mimeTypes';
import { stripMetadata } from '../../utils/stripMetadata';
import {
  ComposerTileStatus,
  FailedTile,
  PreparingTile,
  ReadyTile,
  TComposerTile,
  createTileId,
} from '../../state/room/composerTiles';

export type PrepareOptions = {
  encrypt: boolean;
  /** The server's upload size limit in bytes; a file larger than this never starts uploading. */
  limit: number | undefined;
};

/** The composer's tile list as far as preparing files needs it. */
export type ComposerTileList = {
  put: (tiles: TComposerTile[]) => void;
  /** Does nothing when `from` is no longer in the list, e.g. the user removed it meanwhile. */
  replace: (from: TComposerTile, to: TComposerTile) => void;
};

const prepareUploadFile = async (
  placeholder: PreparingTile,
  file: File,
  { limit }: PrepareOptions
): Promise<ReadyTile | FailedTile> => {
  const { id, name, size } = placeholder;
  if (limit !== undefined && file.size > limit) {
    return {
      id,
      status: ComposerTileStatus.Failed,
      name,
      size,
      failure: { kind: 'too-large', size: file.size, limit },
    };
  }
  try {
    const stripped = await stripMetadata(safeFile(file));
    const item = placeholder.encrypting
      ? await encryptFile(stripped)
      : { file: stripped, originalFile: stripped, encInfo: undefined };
    return {
      id,
      status: ComposerTileStatus.Ready,
      item: { ...item, metadata: { markedAsSpoiler: false } },
    };
  } catch (error) {
    console.error(`Failed to prepare ${name} for upload`, error);
    return {
      id,
      status: ComposerTileStatus.Failed,
      name,
      size,
      failure: {
        kind: 'prepare',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
};

/**
 * Adds a placeholder tile for every file at once, then prepares the files one after the other so
 * a tile turns ready (and its upload starts) as soon as its own file is done. One at a time keeps
 * at most one file and its ciphertext in memory.
 */
export const prepareUploadFiles = async (
  files: File[],
  options: PrepareOptions,
  list: ComposerTileList
): Promise<void> => {
  const placeholders: PreparingTile[] = files.map((file) => ({
    id: createTileId(),
    status: ComposerTileStatus.Preparing,
    name: file.name,
    size: file.size,
    encrypting: options.encrypt,
  }));
  list.put(placeholders);

  for (let i = 0; i < files.length; i += 1) {
    list.replace(placeholders[i], await prepareUploadFile(placeholders[i], files[i], options));
  }
};

import { IContent } from 'matrix-js-sdk';
import { ComposerTileStatus, ReadyTile, TComposerTile } from '../../state/room/composerTiles';
import { TUploadItem } from '../../state/room/roomInputDrafts';
import { UploadSuccess } from '../../state/upload';

export type BuiltUpload = { tile: ReadyTile; content: IContent };
export type BuildFailure = { tile: ReadyTile | undefined; name: string; message: string };

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Builds the message content of every uploaded file without touching the composer, so a file whose
 * content cannot be built is reported by name and its tile is still there to show it. The results
 * keep the tiles' order, which is the order the files were picked in.
 */
export const buildUploadContents = async (
  uploads: UploadSuccess[],
  tiles: TComposerTile[],
  buildContent: (item: TUploadItem, mxc: string) => Promise<IContent>
): Promise<{ built: BuiltUpload[]; failed: BuildFailure[] }> => {
  const results = await Promise.all(
    uploads.map(async (upload): Promise<BuiltUpload | BuildFailure> => {
      const { name } = upload.file;
      const tile = tiles.find(
        (t): t is ReadyTile => t.status === ComposerTileStatus.Ready && t.item.file === upload.file
      );
      if (!tile) {
        return { tile, name, message: 'The file is no longer in the composer' };
      }
      try {
        return { tile, content: await buildContent(tile.item, upload.mxc) };
      } catch (error) {
        console.error(`Failed to build the message for ${name}`, error);
        return { tile, name, message: errorMessage(error) };
      }
    })
  );
  const isBuilt = (result: BuiltUpload | BuildFailure): result is BuiltUpload =>
    'content' in result;
  return {
    built: results.filter(isBuilt).sort((a, b) => tiles.indexOf(a.tile) - tiles.indexOf(b.tile)),
    failed: results.filter((result): result is BuildFailure => !isBuilt(result)),
  };
};

/** The names of the tiles that did not go out with a send, in tile order. */
export const getLeftBehind = (tiles: TComposerTile[], sent: ReadyTile[]): string[] =>
  tiles
    .filter((tile) => !(tile.status === ComposerTileStatus.Ready && sent.includes(tile)))
    .map((tile) => (tile.status === ComposerTileStatus.Ready ? tile.item.file.name : tile.name));

export const describeLeftBehind = (names: string[]): string | undefined =>
  names.length === 0
    ? undefined
    : `Not sent: ${names.join(', ')}. Retry or remove ${names.length === 1 ? 'it' : 'them'}.`;

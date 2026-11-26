import { bytesToSize } from '../../utils/common';
import type { TUploadItem } from './roomInputDrafts';

export enum ComposerTileStatus {
  /** Placeholder while a picked file is read, stripped and, in an encrypted room, encrypted. */
  Preparing = 'preparing',
  /** The file never reached an upload; it is shown with the reason and can only be removed. */
  Failed = 'failed',
  /** The file is ready to upload; the upload atom of its file holds the upload's own state. */
  Ready = 'ready',
}

export type TileFailure =
  { kind: 'too-large'; size: number; limit: number } | { kind: 'prepare'; message: string };

export type PreparingTile = {
  id: string;
  status: ComposerTileStatus.Preparing;
  name: string;
  size: number;
  encrypting: boolean;
};

export type FailedTile = {
  id: string;
  status: ComposerTileStatus.Failed;
  name: string;
  size: number;
  failure: TileFailure;
};

export type ReadyTile = {
  id: string;
  status: ComposerTileStatus.Ready;
  item: TUploadItem;
};

/** What the composer shows for one picked file; the id is the tile's React key and never changes. */
export type TComposerTile = PreparingTile | FailedTile | ReadyTile;

let lastTileId = 0;
export const createTileId = (): string => {
  lastTileId += 1;
  return `tile-${lastTileId}`;
};

export const getTileName = (tile: TComposerTile): string =>
  tile.status === ComposerTileStatus.Ready ? tile.item.file.name : tile.name;

export const getReadyItems = (tiles: TComposerTile[]): TUploadItem[] =>
  tiles.flatMap((tile) => (tile.status === ComposerTileStatus.Ready ? [tile.item] : []));

export const describeTileFailure = (failure: TileFailure): string =>
  failure.kind === 'too-large'
    ? `File is ${bytesToSize(failure.size)}, the limit is ${bytesToSize(failure.limit)}.`
    : `Could not prepare the file: ${failure.message}`;

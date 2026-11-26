import React from 'react';
import { Box, Icon, IconButton, Icons, Spinner, Text } from 'folds';
import * as css from './UploadCard.css';
import { UploadCardError } from './UploadCard';
import { UploadCardRenderer } from './UploadCardRenderer';
import {
  ComposerTileStatus,
  FailedTile,
  PreparingTile,
  ReadyTile,
  TComposerTile,
  describeTileFailure,
} from '../../state/room/composerTiles';
import { TUploadMetadata } from '../../state/room/roomInputDrafts';

type PreparingTileCardProps = {
  tile: PreparingTile;
  onRemove: () => void;
};
function PreparingTileCard({ tile, onRemove }: PreparingTileCardProps) {
  return (
    <Box className={css.UploadTile} direction="Column" gap="100">
      <Box className={css.UploadTileFrame}>
        <Spinner size="400" variant="Secondary" />
        <Box className={css.UploadTileActions}>
          <IconButton
            onClick={onRemove}
            aria-label="Remove File"
            variant="Critical"
            radii="300"
            size="300"
          >
            <Icon src={Icons.Delete} size="100" />
          </IconButton>
        </Box>
      </Box>
      <Text size="T300" truncate title={tile.name}>
        {tile.name}
      </Text>
      <Text role="status" size="T200" priority="300">
        {tile.encrypting ? 'Encrypting…' : 'Preparing…'}
      </Text>
    </Box>
  );
}

type FailedTileCardProps = {
  tile: FailedTile;
  onRemove: () => void;
};
function FailedTileCard({ tile, onRemove }: FailedTileCardProps) {
  const message = describeTileFailure(tile.failure);
  return (
    <Box className={css.UploadTile} direction="Column" gap="100">
      <Box className={css.UploadTileFrame} data-failed>
        <Icon src={Icons.Warning} size="400" />
        <Box className={css.UploadTileActions}>
          <IconButton
            onClick={onRemove}
            aria-label="Remove File"
            variant="Critical"
            radii="300"
            size="300"
          >
            <Icon src={Icons.Delete} size="100" />
          </IconButton>
        </Box>
      </Box>
      <Text size="T300" truncate title={tile.name}>
        {tile.name}
      </Text>
      <UploadCardError>
        <Text className={css.UploadTileErrorText} role="alert" size="T200" title={message}>
          {message}
        </Text>
      </UploadCardError>
    </Box>
  );
}

type ComposerTilesProps = {
  tiles: TComposerTile[];
  setMetadata: (tile: ReadyTile, metadata: TUploadMetadata) => void;
  onRemove: (tile: TComposerTile) => void;
};
/** Every tile is keyed by its id, so removing one leaves the others' uploads untouched. */
export function ComposerTiles({ tiles, setMetadata, onRemove }: ComposerTilesProps) {
  return (
    <>
      {[...tiles].reverse().map((tile) => {
        switch (tile.status) {
          case ComposerTileStatus.Preparing:
            return <PreparingTileCard key={tile.id} tile={tile} onRemove={() => onRemove(tile)} />;
          case ComposerTileStatus.Failed:
            return <FailedTileCard key={tile.id} tile={tile} onRemove={() => onRemove(tile)} />;
          case ComposerTileStatus.Ready:
            return (
              <UploadCardRenderer
                key={tile.id}
                isEncrypted={!!tile.item.encInfo}
                fileItem={tile.item}
                setMetadata={(_item, metadata) => setMetadata(tile, metadata)}
                onRemove={() => onRemove(tile)}
              />
            );
          default:
            return null;
        }
      })}
    </>
  );
}

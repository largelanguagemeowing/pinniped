import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

export const AlbumGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: config.space.S100,
  maxWidth: toRem(480),
});

// Each file fills a square cell; the media renderer fills it in `fill` mode.
export const AlbumItem = style({
  minWidth: 0,
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  borderRadius: config.radii.R300,
});

export const AlbumCaption = style({
  marginBottom: config.space.S200,
});

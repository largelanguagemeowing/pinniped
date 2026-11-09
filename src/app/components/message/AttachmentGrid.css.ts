import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

export const AttachmentGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: config.space.S100,
  maxWidth: toRem(480),
});

// Each file fills a square cell; the media renderer fills it in `fill` mode.
export const AttachmentItem = style({
  minWidth: 0,
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  borderRadius: config.radii.R300,
});

export const AttachmentStack = style({
  display: 'flex',
  flexDirection: 'column',
  gap: config.space.S200,
  maxWidth: toRem(400),
});

export const AttachmentStackItem = style({
  minWidth: 0,
});

export const AttachmentCaption = style({
  marginBottom: config.space.S200,
});

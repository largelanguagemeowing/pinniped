import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

// Link embed card: accent bar on the left, provider,
// author, title and description stacked, with either a small thumbnail on the
// right or a large image underneath.
export const UrlPreview = style([
  DefaultReset,
  {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    columnGap: config.space.S400,
    rowGap: config.space.S200,
    maxWidth: toRem(432),
    padding: `${config.space.S300} ${config.space.S400} ${config.space.S400} ${config.space.S300}`,
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
    borderLeft: `${toRem(4)} solid ${color.SurfaceVariant.ContainerLine}`,
    borderRadius: config.radii.R300,
    overflow: 'hidden',
  },
]);

export const UrlPreviewWithThumbnail = style({
  gridTemplateColumns: 'minmax(0, 1fr) auto',
});

export const UrlPreviewContent = style([
  DefaultReset,
  {
    gridColumn: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S200,
    minWidth: 0,
  },
]);

export const UrlPreviewProvider = style([
  DefaultReset,
  {
    opacity: config.opacity.P400,
    overflowWrap: 'anywhere',
  },
]);

export const UrlPreviewAuthor = style([
  DefaultReset,
  {
    fontWeight: config.fontWeight.W600,
    overflowWrap: 'anywhere',
  },
]);

export const UrlPreviewTitle = style([
  DefaultReset,
  {
    color: color.Success.Main,
    fontWeight: config.fontWeight.W600,
    overflowWrap: 'anywhere',
    textDecoration: 'none',
    ':hover': {
      textDecoration: 'underline',
    },
  },
]);

export const UrlPreviewDescription = style([
  DefaultReset,
  {
    whiteSpace: 'pre-line',
    overflowWrap: 'anywhere',
  },
]);

const imgBase = {
  display: 'block',
  objectFit: 'cover',
  borderRadius: config.radii.R300,
  cursor: 'pointer',
  ':hover': {
    filter: 'brightness(0.85)',
  },
} as const;

export const UrlPreviewThumbnail = style([
  DefaultReset,
  {
    ...imgBase,
    gridColumn: 2,
    gridRow: 1,
    width: toRem(80),
    height: toRem(80),
    objectFit: 'contain',
  },
]);

export const UrlPreviewImg = style([
  DefaultReset,
  {
    ...imgBase,
    gridColumn: '1 / -1',
    maxWidth: '100%',
    maxHeight: toRem(300),
    width: 'auto',
    objectFit: 'contain',
  },
]);

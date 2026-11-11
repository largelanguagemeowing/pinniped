import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

// Card for fediverse posts: author block
// with the avatar on the right, caption, media mosaic and a footer with the
// site and an "open original" button.
export const Post = style([
  DefaultReset,
  {
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S300,
    width: '100%',
    maxWidth: toRem(432),
    padding: config.space.S400,
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
    borderLeft: `${toRem(4)} solid ${color.SurfaceVariant.ContainerLine}`,
    borderRadius: config.radii.R300,
    overflow: 'hidden',
  },
]);

export const PostHeader = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'flex-start',
    gap: config.space.S400,
  },
]);

export const PostAuthor = style([
  DefaultReset,
  {
    display: 'flex',
    flexDirection: 'column',
    gap: config.space.S100,
    flexGrow: 1,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
]);

export const PostHandle = style([
  DefaultReset,
  {
    color: color.Success.Main,
    textDecoration: 'none',
    ':hover': {
      textDecoration: 'underline',
    },
  },
]);

export const PostStats = style([
  DefaultReset,
  {
    marginTop: config.space.S200,
    whiteSpace: 'pre-wrap',
  },
]);

export const PostAvatar = style([
  DefaultReset,
  {
    position: 'relative',
    width: toRem(100),
    height: toRem(100),
    flexShrink: 0,
    padding: 0,
    border: 'none',
    borderRadius: config.radii.R300,
    overflow: 'hidden',
    cursor: 'pointer',
  },
]);

export const PostText = style([
  DefaultReset,
  {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
]);

export const PostGallery = style([
  DefaultReset,
  {
    display: 'flex',
    flexDirection: 'column',
    gap: toRem(4),
    borderRadius: config.radii.R300,
    overflow: 'hidden',
  },
]);

export const PostGalleryRow = style([
  DefaultReset,
  {
    display: 'grid',
    gap: toRem(4),
  },
]);

// One big tile on the left, two stacked on the right.
export const PostGalleryOneByTwo = style([
  DefaultReset,
  {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gridTemplateRows: '1fr 1fr',
    gap: toRem(4),
    aspectRatio: '4 / 3',
  },
]);

export const PostTile = style([
  DefaultReset,
  {
    position: 'relative',
    display: 'block',
    width: '100%',
    height: '100%',
    minHeight: 0,
    padding: 0,
    border: 'none',
    backgroundColor: color.SurfaceVariant.ContainerActive,
    cursor: 'pointer',
    overflow: 'hidden',
    ':hover': {
      filter: 'brightness(0.9)',
    },
    selectors: {
      [`${PostGalleryOneByTwo} > &:first-child`]: {
        gridRow: '1 / span 2',
      },
    },
  },
]);

export const PostTileImg = style([
  DefaultReset,
  {
    position: 'absolute',
    inset: 0,
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
]);

export const PostTilePlay = style([
  DefaultReset,
  {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: toRem(48),
    height: toRem(48),
    borderRadius: '50%',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    color: '#fff',
    pointerEvents: 'none',
  },
]);

export const PostFooter = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S300,
  },
]);

export const PostFooterInfo = style([
  DefaultReset,
  {
    display: 'flex',
    alignItems: 'center',
    gap: config.space.S200,
    flexGrow: 1,
    minWidth: 0,
    opacity: config.opacity.P400,
  },
]);

export const PostSiteIcon = style([
  DefaultReset,
  {
    width: toRem(16),
    height: toRem(16),
    flexShrink: 0,
    objectFit: 'contain',
  },
]);

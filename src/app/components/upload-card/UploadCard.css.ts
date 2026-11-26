import { style } from '@vanilla-extract/css';
import { RecipeVariants, recipe } from '@vanilla-extract/recipes';
import { RadiiVariant, color, config, toRem } from 'folds';

export const UploadCard = recipe({
  base: {
    padding: config.space.S300,
    backgroundColor: color.SurfaceVariant.Container,
    color: color.SurfaceVariant.OnContainer,
    borderColor: color.SurfaceVariant.ContainerLine,
  },
  variants: {
    radii: RadiiVariant,
    outlined: {
      true: {
        borderStyle: 'solid',
        borderWidth: config.borderWidth.B300,
      },
    },
    compact: {
      true: {
        padding: config.space.S100,
      },
    },
  },
  defaultVariants: {
    radii: '400',
  },
});

export type UploadCardVariant = RecipeVariants<typeof UploadCard>;

export const UploadCardError = style({
  padding: `0 ${config.space.S100}`,
  color: color.Critical.Main,
});

export const UploadTile = style({
  width: toRem(160),
  minWidth: toRem(160),
});

export const UploadTileFrame = style({
  position: 'relative',
  width: '100%',
  height: toRem(160),
  borderRadius: config.radii.R300,
  overflow: 'hidden',
  backgroundColor: color.SurfaceVariant.Container,
  color: color.SurfaceVariant.OnContainer,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const UploadTileMedia = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
});

/** A long error wraps inside the tile and stops at three lines; the full text is in its title. */
export const UploadTileErrorText = style({
  minWidth: 0,
  overflowWrap: 'anywhere',
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
});

export const UploadTileDone = style({
  position: 'absolute',
  left: config.space.S100,
  bottom: config.space.S100,
  padding: config.space.S100,
  borderRadius: config.radii.Pill,
  backgroundColor: color.Surface.Container,
});

export const UploadTileActions = style({
  position: 'absolute',
  top: config.space.S100,
  right: config.space.S100,
  display: 'flex',
  gap: config.space.S100,
  opacity: 0,
  transition: 'opacity 100ms ease-out',
  selectors: {
    [`${UploadTileFrame}:hover &`]: {
      opacity: 1,
    },
    [`${UploadTileFrame}:focus-within &`]: {
      opacity: 1,
    },
    // A failed tile needs its Retry and Remove at hand, hovered or not.
    [`${UploadTileFrame}[data-failed="true"] &`]: {
      opacity: 1,
    },
  },
  // Touch screens have no hover to reveal the controls.
  '@media': {
    '(hover: none)': {
      opacity: 1,
    },
  },
});

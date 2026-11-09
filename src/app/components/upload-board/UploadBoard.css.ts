import { style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';

export const UploadBoardBase = style([
  DefaultReset,
  {
    position: 'relative',
    pointerEvents: 'none',
  },
]);

export const UploadBoardContainer = style([
  DefaultReset,
  {
    position: 'absolute',
    bottom: config.space.S200,
    left: 0,
    right: 0,
    zIndex: config.zIndex.Max,
  },
]);

export const UploadBoard = style({
  width: '100%',
  maxHeight: toRem(450),
  height: '100%',
  backgroundColor: color.Surface.Container,
  color: color.Surface.OnContainer,
  borderRadius: config.radii.R400,
  boxShadow: config.shadow.E200,
  border: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
  overflow: 'hidden',
  pointerEvents: 'all',
});

export const UploadBoardContent = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: config.space.S200,
  padding: config.space.S200,
});

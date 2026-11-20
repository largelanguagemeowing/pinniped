import { globalStyle, style } from '@vanilla-extract/css';
import { DefaultReset, color, config, toRem } from 'folds';
import { inputModeSelector } from '../../utils/inputMode';

export const ImageEditor = style([
  DefaultReset,
  {
    height: '100%',
    minHeight: 0,
  },
]);

export const ImageEditorHeader = style([
  DefaultReset,
  {
    paddingLeft: config.space.S400,
    paddingRight: config.space.S200,
    flexShrink: 0,
  },
]);

export const ImageEditorContent = style([
  DefaultReset,
  {
    minHeight: 0,
    padding: config.space.S400,
    backgroundColor: color.Background.Container,
    color: color.Background.OnContainer,
    overflow: 'auto',
    gap: config.space.S400,
  },
]);

export const CropStage = style({
  position: 'relative',
  width: '100%',
  maxWidth: toRem(720),
  height: `clamp(${toRem(280)}, 55dvh, ${toRem(520)})`,
  flexShrink: 0,
  overflow: 'hidden',
  borderRadius: config.radii.R400,
  backgroundColor: color.Surface.Container,
});

export const Image = style({
  width: '100%',
  height: '100%',
  display: 'block',
  objectFit: 'contain',
  userSelect: 'none',
  pointerEvents: 'none',
});

export const CropSelection = style({
  position: 'absolute',
  inset: 0,
  zIndex: 1,
  padding: 0,
  border: `${toRem(4)} solid white`,
  borderRadius: 0,
  background: 'transparent',
  boxShadow: `0 0 0 ${toRem(9999)} rgba(0, 0, 0, 0.62)`,
  cursor: 'move',
  touchAction: 'none',
  selectors: {
    // inside the white frame; the stage clips anything outside
    [`${inputModeSelector('keyboard')} &:focus-visible`]: {
      outlineOffset: toRem(-6),
    },
    '&:active': {
      cursor: 'grabbing',
    },
  },
});

export const ZoomControl = style({
  width: 'min(100%, 280px)',
  color: color.Background.OnContainer,
});

globalStyle(`${ZoomControl} input`, {
  width: '100%',
  accentColor: color.Primary.Main,
});

export const ImageEditorFooter = style({
  flexShrink: 0,
  padding: config.space.S400,
  borderTop: `${config.borderWidth.B300} solid ${color.Surface.ContainerLine}`,
});

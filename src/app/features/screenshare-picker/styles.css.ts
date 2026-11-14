import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const Tabs = style({
  display: 'flex',
  gap: config.space.S100,
  padding: config.space.S100,
  borderRadius: config.radii.R400,
  backgroundColor: color.Background.Container,
});

export const Tab = style({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: config.space.S200,
  padding: `${config.space.S300} 0`,
  border: 'none',
  borderRadius: config.radii.R300,
  background: 'none',
  color: color.Surface.OnContainer,
  font: 'inherit',
  fontWeight: 500,
  cursor: 'pointer',
  selectors: {
    '&:hover': { backgroundColor: color.Surface.ContainerHover },
    '&[aria-selected="true"]': {
      backgroundColor: color.Surface.ContainerActive,
      color: color.Surface.OnContainer,
    },
  },
});

export const Grid = style({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(${toRem(260)}, 1fr))`,
  gap: config.space.S400,
  alignContent: 'start',
});

export const Card = style({
  padding: 0,
  border: 'none',
  background: 'none',
  textAlign: 'left',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
  borderRadius: config.radii.R400,
  selectors: {
    '&:focus-visible': { outline: 'none' },
  },
});

export const Thumb = style({
  aspectRatio: '16 / 9',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  backgroundColor: color.Background.Container,
  border: `${config.borderWidth.B500} solid transparent`,
  borderRadius: config.radii.R400,
  selectors: {
    [`${Card}:hover &`]: { borderColor: color.Surface.ContainerLine },
    [`${Card}:focus-visible &`]: { borderColor: color.Primary.Main },
    [`${Card}[aria-pressed="true"] &`]: { borderColor: color.Primary.Main },
  },
});

export const ThumbImage = style({
  maxWidth: '100%',
  maxHeight: '100%',
  display: 'block',
});

export const CardLabel = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  padding: `${config.space.S200} ${config.space.S100} 0`,
  minWidth: 0,
});

export const CardIcon = style({
  width: toRem(20),
  height: toRem(20),
  borderRadius: config.radii.R300,
  flexShrink: 0,
});

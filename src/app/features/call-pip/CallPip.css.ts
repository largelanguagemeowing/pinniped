import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const layer = style({
  position: 'fixed',
  inset: 0,
  // Above the app, below its menus and dialogs.
  zIndex: config.zIndex.Z200,
  pointerEvents: 'none',
});

export const window = style({
  position: 'absolute',
  top: 0,
  left: 0,
  aspectRatio: '16 / 9',
  pointerEvents: 'auto',
  touchAction: 'none',
  userSelect: 'none',
  cursor: 'grab',
  transition: 'width 0.2s ease-in-out',
  selectors: {
    '&[data-dragging="true"]': { cursor: 'grabbing', transition: 'none' },
    '&[data-resizing="true"]': { transition: 'none' },
  },
});

export const tile = style({
  position: 'relative',
  inlineSize: '100%',
  blockSize: '100%',
  background: color.Background.Container,
  borderRadius: toRem(8),
  overflow: 'hidden',
  transform: 'translateZ(0)',
  boxShadow: '0 8px 24px rgb(0 0 0 / 0.4), 0 0 0 1px rgb(255 255 255 / 0.08)',
  selectors: {
    '[data-dragging="true"] &': { pointerEvents: 'none' },
  },
});

export const media = style({
  position: 'absolute',
  inset: 0,
  // The tile draws its own rounded corners and name tag; the window supplies both.
  borderRadius: 0,
});

export const controls = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  padding: config.space.S200,
  color: '#fff',
  background:
    'linear-gradient(to bottom, rgb(0 0 0 / 0.7) 0%, transparent 30%, transparent 60%, rgb(0 0 0 / 0.7) 100%)',
  opacity: 1,
  transition: 'opacity 0.2s ease-in-out',
  selectors: {
    '&[data-idle="true"]': { opacity: 0, pointerEvents: 'none' },
  },
});

const bar = {
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  minInlineSize: 0,
  transition: 'transform 0.2s ease-in-out',
} as const;

export const topBar = style({
  ...bar,
  selectors: {
    [`${controls}[data-idle="true"] &`]: { transform: 'translate3d(0, -8px, 0)' },
  },
});

export const bottomBar = style({
  ...bar,
  justifyContent: 'space-between',
  selectors: {
    [`${controls}[data-idle="true"] &`]: { transform: 'translate3d(0, 8px, 0)' },
  },
});

export const title = style({
  appearance: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S100,
  minInlineSize: 0,
  padding: 0,
  border: 0,
  background: 'none',
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
  selectors: {
    '&:hover': { textDecoration: 'underline' },
  },
});

export const ellipsis = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const hangup = style({
  appearance: 'none',
  display: 'flex',
  flexShrink: 0,
  padding: toRem(6),
  border: 0,
  borderRadius: config.radii.Pill,
  background: 'rgb(0 0 0 / 0.6)',
  color: '#fff',
  cursor: 'pointer',
  selectors: {
    '&:hover': { background: color.Critical.Main },
  },
});

export const handle = style({
  position: 'absolute',
  width: toRem(20),
  height: toRem(20),
  touchAction: 'none',
  selectors: {
    '&[data-corner="top-left"]': { top: toRem(-7), left: toRem(-7), cursor: 'nwse-resize' },
    '&[data-corner="top-right"]': { top: toRem(-7), right: toRem(-7), cursor: 'nesw-resize' },
    '&[data-corner="bottom-left"]': { bottom: toRem(-7), left: toRem(-7), cursor: 'nesw-resize' },
    '&[data-corner="bottom-right"]': { bottom: toRem(-7), right: toRem(-7), cursor: 'nwse-resize' },
  },
});

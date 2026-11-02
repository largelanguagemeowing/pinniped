import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

export const CallViewContent = style({
  padding: config.space.S400,
  paddingRight: 0,
  minHeight: '100%',
});

export const ControlCard = style({
  padding: config.space.S300,
});

export const ControlDivider = style({
  height: toRem(24),
});

export const CallMemberCard = style({
  padding: config.space.S300,
});

export const CallControlContainer = style({
  // ~18px under the participant strip, ~11px under the bar.
  padding: `${toRem(18)} ${config.space.S400} ${toRem(11)}`,
  position: 'relative',
});

export const EdgeControlLeft = style({
  position: 'absolute',
  left: config.space.S400,
  top: '50%',
  transform: 'translateY(-50%)',
});

export const EdgeControlRight = style({
  position: 'absolute',
  right: config.space.S400,
  top: '50%',
  transform: 'translateY(-50%)',
});

export const PrescreenMessage = style({
  padding: config.space.S200,
});

export const ControlGroup = style({
  padding: config.space.S100,
  borderRadius: config.radii.R400,
  background: color.SurfaceVariant.Container,
});

// Critical control colours: base, hover and active.
export const EndButton = style({
  minWidth: toRem(80),
  backgroundColor: '#d22d39 !important',
  selectors: {
    '&:hover:not(:disabled)': { backgroundColor: '#a9232e !important' },
    '&:active:not(:disabled)': { backgroundColor: '#961e2b !important' },
  },
});

export const MenuSlider = style({ width: '100%' });

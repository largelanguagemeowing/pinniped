import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

/** The "Find a conversation" box in the DM list header: a flat, translucent 32px pill. */
export const DmFilter = style({
  height: toRem(32),
  minHeight: toRem(32),
  borderRadius: config.radii.R300,
  border: 'none',
  boxShadow: 'none',
  backgroundColor: 'rgba(151, 151, 159, 0.12)',
  color: color.Background.OnContainer,
  selectors: {
    '&:focus-within': {
      backgroundColor: 'rgba(151, 151, 159, 0.18)',
    },
  },
});


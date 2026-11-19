import { style } from '@vanilla-extract/css';

/** Round; placed and sized by the tile (the image and fallback fill it). */
export const avatar = style({
  overflow: 'hidden',
  borderRadius: '50%',
});

export const initials = style({
  // Scales with the avatar, which is sized in the tile's container units.
  fontSize: 'min(20cqmin, 32px)',
  fontWeight: 600,
  lineHeight: 1,
});

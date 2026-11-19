import { style } from '@vanilla-extract/css';

/** Pins an absolutely positioned tile to the corner its data-*-alignment attributes name. */
export const pipAlignment = style({
  selectors: {
    '&[data-block-alignment="start"]': { insetBlockEnd: 'unset' },
    '&[data-block-alignment="end"]': { insetBlockStart: 'unset' },
    '&[data-inline-alignment="start"]': { insetInlineEnd: 'unset' },
    '&[data-inline-alignment="end"]': { insetInlineStart: 'unset' },
  },
});

/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

import { mediaVars } from './MediaView.css';

export const tile = style({});

export const maximised = style({});

export const contents = style({
  blockSize: '100%',
  inlineSize: '100%',
  display: 'flex',
  borderRadius: '24px',
  contain: 'strict',
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollbarWidth: 'none',
  scrollSnapType: 'inline mandatory',
  scrollSnapStop: 'always',
  // No smooth scrolling: Firefox does not re-snap if the snapping point changes while it
  // animates to another one.
  selectors: {
    [`${maximised} &`]: { borderRadius: 0 },
  },
});

export const item = style({
  vars: { [mediaVars.fgInset]: '10px' },
  height: '100%',
  flexBasis: '100%',
  flexShrink: 0,
  selectors: {
    // Foreground elements within the safe area
    [`${maximised} &`]: {
      vars: {
        [mediaVars.fgInset]:
          'calc(env(safe-area-inset-top) + 10px) calc(env(safe-area-inset-right) + 10px) calc(env(safe-area-inset-bottom) + 10px) calc(env(safe-area-inset-left) + 10px)',
      },
    },
  },
});

export const snap = style({
  scrollSnapAlign: 'start',
});

/** Where there is a pointer, buttons on the tile appear while it is hovered or focused. */
const revealed = {
  '@media': {
    '(hover)': {
      opacity: 0,
      selectors: {
        [`${tile}:hover &, ${tile}:has(:focus-visible) &`]: { opacity: 1 },
      },
    },
  },
};

export const advance = style([
  revealed,
  {
    appearance: 'none',
    cursor: 'pointer',
    display: 'flex',
    padding: toRem(11),
    border: `1px solid rgb(255 255 255 / 0.2)`,
    borderRadius: config.radii.Pill,
    background: 'rgb(0 0 0 / 0.6)',
    color: '#fff',
    boxShadow: '0px 1.2px 2.4px 0px rgba(0, 0, 0, 0.15)',
    transitionDuration: '0.1s',
    transitionProperty: 'opacity, background-color, border-color',
    position: 'absolute',
    zIndex: 1,
    // Centred vertically on the tile
    top: '50%',
    transform: 'translateY(-50%)',
    ':active': { background: 'rgb(0 0 0 / 0.8)' },
  },
]);

export const back = style({ insetInlineStart: config.space.S100 });

export const next = style({ insetInlineEnd: config.space.S100 });

export const bottomRightButtons = style({
  display: 'flex',
  gap: config.space.S200,
  position: 'absolute',
  insetBlockEnd: config.space.S100,
  insetInlineEnd: config.space.S100,
  zIndex: 1,
});

/** Stream volume: a speaker button; hovering it raises a vertical slider. */
export const volumeControl = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
});

const SLIDER_LENGTH = toRem(110);

/** Flush above the button (padding, not margin, so the pointer never leaves the control). */
export const volumePopup = style({
  position: 'absolute',
  insetBlockEnd: '100%',
  paddingBlockEnd: config.space.S100,
  display: 'none',
  selectors: {
    [`${volumeControl}:hover &, ${volumeControl}:focus-within &`]: { display: 'block' },
  },
});

export const volumeSliderBox = style({
  position: 'relative',
  inlineSize: toRem(16),
  blockSize: SLIDER_LENGTH,
  padding: `${config.space.S300} ${config.space.S200}`,
  borderRadius: config.radii.Pill,
  background: color.Surface.Container,
  border: `1px solid ${color.Surface.ContainerLine}`,
  boxSizing: 'content-box',
  boxShadow: '0px 1.2px 2.4px 0px rgba(0, 0, 0, 0.15)',
});

/** The horizontal range input, turned to run bottom to top. */
export const volumeSlider = style({
  position: 'absolute',
  top: '50%',
  left: '50%',
  width: SLIDER_LENGTH,
  transform: 'translate(-50%, -50%) rotate(-90deg)',
});

export const volumeButton = style([
  revealed,
  {
    appearance: 'none',
    cursor: 'pointer',
    display: 'flex',
    padding: config.space.S200,
    border: 'none',
    borderRadius: config.radii.Pill,
    background: 'rgb(0 0 0 / 0.6)',
    color: '#fff',
    boxShadow: '0px 1.2px 2.4px 0px rgba(0, 0, 0, 0.15)',
    transition: 'opacity 0.15s, background-color 0.1s',
    zIndex: 1,
    ':hover': { background: 'rgb(0 0 0 / 0.75)' },
    ':active': { background: 'rgb(0 0 0 / 0.85)' },
  },
]);

export const indicators = style({
  display: 'flex',
  gap: config.space.S200,
  position: 'absolute',
  insetInlineStart: 0,
  insetBlockEnd: '-24px',
  width: '100%',
  justifyContent: 'start',
  transition: 'opacity ease 0.15s',
  opacity: 0,
  selectors: {
    [`${maximised} &`]: { insetBlockEnd: '-18px', justifyContent: 'center' },
  },
});

export const showIndicators = style({ opacity: 1 });

export const indicator = style({
  flexBasis: '32px',
  blockSize: '2px',
  transition: 'background-color ease 0.15s',
  selectors: {
    '&[data-visible="false"]': { background: 'rgb(255 255 255 / 0.3)' },
    '&[data-visible="true"]': { background: '#fff' },
  },
});

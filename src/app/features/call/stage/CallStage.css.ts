/*
Copyright 2021-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

/** The call view: the positioning context of the fixed layer, which does not scroll. */
export const stage = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  outline: 'none',
});

/** Scrolls the scrolling layer; the fixed layer is positioned against the stage instead. */
export const scroller = style({
  display: 'flex',
  flexDirection: 'column',
  overflowX: 'hidden',
  // Always reserve the scrollbar's space instead of letting it come and go. The layouts size
  // their tiles to the width left beside it, so a scrollbar that comes and goes would change
  // the layout, and the layout could then keep the scrollbar in place by itself.
  scrollbarGutter: 'stable',
});

const layer = style({
  // The layers don't block what is behind them; their tiles take the pointer.
  pointerEvents: 'none',
});

globalStyle(`${layer} > :not(:first-child)`, { pointerEvents: 'initial' });

/** Sized to the scrolling layer's width (set inline), so the two layers line up beside the scrollbar. */
export const fixedGrid = style([
  layer,
  {
    position: 'absolute',
    insetInlineStart: 0,
  },
]);

export const scrollingGrid = style([
  layer,
  {
    position: 'relative',
    flexGrow: 1,
    inlineSize: '100%',
    alignSelf: 'center',
  },
]);

export const tile = style({
  position: 'absolute',
  insetBlockStart: 0,
});

export const maximised = style({
  position: 'relative',
  flexGrow: 1,
});

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

/** Dims the tiles while the call reconnects. */
export const reconnecting = style({
  position: 'absolute',
  inset: 0,
  zIndex: 3,
  display: 'grid',
  placeItems: 'center',
  background: 'rgb(0 0 0 / 0.5)',
  animation: `${fadeIn} 0.2s ease`,
  '@media': {
    '(prefers-reduced-motion)': { animation: 'none' },
  },
});

export const reconnectingToast = style({
  display: 'flex',
  alignItems: 'center',
  gap: config.space.S200,
  padding: `${config.space.S200} ${config.space.S400}`,
  borderRadius: config.radii.Pill,
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  boxShadow: config.shadow.E200,
  minHeight: toRem(36),
});

/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createContainer, globalStyle, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

import { grid as gridRoot } from './Grid.css';
import { GRID_TILE_ASPECT, STRIP_GAP, STRIP_HEIGHT } from './arrangeGrid';
import { cssVar, stripVars } from './vars';

const TOGGLE_HEIGHT = 30;

/** Focused view: the stream on top, participants in a strip below. */
export const layer = style({
  position: 'relative',
  blockSize: '100%',
  boxSizing: 'border-box',
  display: 'grid',
  gap: `${STRIP_GAP}px`,
  gridTemplateColumns: '1fr',
  // The strip is always exactly one row tall, so the fixed and scrolling layers agree on how
  // much room the spotlight gets.
  gridTemplateRows: `minmax(0, 1fr) ${STRIP_HEIGHT}px`,
});

export const stripHidden = style({
  gridTemplateRows: 'minmax(0, 1fr)',
});

const spotlightContainer = createContainer();

export const spotlight = style({
  position: 'relative',
  containerName: spotlightContainer,
  containerType: 'size',
  display: 'grid',
  placeItems: 'center',
});

export const withIndicators = style({});

export const slot = style({
  '@container': {
    // The condition only selects the container, so its cq units can be used.
    [`${spotlightContainer} (width > 0)`]: {
      selectors: {
        // The stream tile is the largest 16:9 box that fits, so its name tag and Live badge
        // sit on the video rather than the pane's edges.
        [`${spotlight} > &`]: {
          inlineSize: `min(100cqi, 100cqb * ${GRID_TILE_ASPECT})`,
          blockSize: `min(100cqb, 100cqi / ${GRID_TILE_ASPECT})`,
        },
      },
    },
  },
});

export const grid = style({
  position: 'relative',
  display: 'flex',
  flexWrap: 'nowrap',
  overflowX: 'auto',
  scrollbarWidth: 'none',
  gap: `${STRIP_GAP}px`,
  justifyContent: 'safe center',
  alignContent: 'center',
  // Kept free at each end; arrangeStrip sizes the tiles to the width left.
  paddingInline: `${STRIP_GAP}px`,
  selectors: {
    [`${stripHidden} > &`]: { display: 'none' },
  },
});

export const spacer = style({});

globalStyle(`${grid} > ${slot}, ${grid} > ${spacer}`, {
  flex: '0 0 auto',
  inlineSize: cssVar(stripVars.tileWidth, '195px'),
  blockSize: cssVar(stripVars.tileHeight, '112px'),
});

/** The "Hide Members" pill: centred 8px inside the top of the strip, or at the bottom of the stream once the strip is hidden. */
export const stripToggle = style({
  position: 'absolute',
  insetBlockEnd: `${STRIP_HEIGHT - STRIP_GAP - TOGGLE_HEIGHT}px`,
  insetInlineStart: '50%',
  transform: 'translateX(-50%)',
  zIndex: 2,
  display: 'grid',
  gridAutoFlow: 'column',
  placeItems: 'center',
  gap: config.space.S100,
  padding: `0 ${toRem(12)}`,
  blockSize: `${TOGGLE_HEIGHT}px`,
  border: 'none',
  borderRadius: `${TOGGLE_HEIGHT / 2}px`,
  background: 'rgb(0 0 0 / 0.6)',
  color: '#fff',
  cursor: 'pointer',
  // The layout layers ignore the pointer; the pill itself must not.
  pointerEvents: 'auto',
  opacity: 0,
  transition: 'opacity 0.15s',
  selectors: {
    // With the strip hidden the pill is the only way back, so it stays up while the pointer is
    // active and fades with the rest of the call controls once the user is idle.
    [`${stripHidden} &`]: { insetBlockEnd: '8px', opacity: 1 },
    [`[data-call-stage][data-idle="true"] ${stripHidden} &`]: { opacity: 0 },
    '&:hover, &:focus-visible, [data-call-stage][data-idle="true"] &:hover': { opacity: 1 },
    // Strip tiles are drawn beside the layout in the same grid, so match hover on them from there.
    [`${gridRoot}:has([data-pinniped-user-id]:hover, [data-testid="screenSharePreview"]:hover) &`]:
      { opacity: 1 },
    '&:focus-visible': { outline: `${toRem(2)} solid ${color.Primary.Main}` },
  },
});

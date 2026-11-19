/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { style } from '@vanilla-extract/css';

import { SPOTLIGHT_INDICATORS_MARGIN, SPOTLIGHT_MARGIN } from './arrangeGrid';
import { cssVar, gridVars } from './vars';

export const layer = style({
  blockSize: '100%',
  marginInline: 0,
  display: 'block',
});

export const spotlight = style({
  containerType: 'size',
  display: 'grid',
  placeItems: 'center',
  inlineSize: '100%',
  aspectRatio: '16 / 9',
  marginBlockEnd: `${SPOTLIGHT_MARGIN}px`,
});

export const withIndicators = style({
  marginBlockEnd: `${SPOTLIGHT_MARGIN + SPOTLIGHT_INDICATORS_MARGIN}px`,
});

export const grid = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: cssVar(gridVars.gap),
  justifyContent: 'center',
  alignContent: 'start',
  paddingInline: cssVar(gridVars.gap),
});

export const slot = style({
  selectors: {
    [`${spotlight} > &`]: {
      inlineSize: '100%',
      blockSize: '100%',
    },
    [`${grid} > &`]: {
      inlineSize: cssVar(gridVars.tileWidth),
      blockSize: cssVar(gridVars.tileHeight),
    },
  },
});

/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { style } from '@vanilla-extract/css';
import { GRID_INSET } from './arrangeGrid';
import { cssVar, gridVars } from './vars';

export const fixed = style({
  blockSize: '100%',
  position: 'relative',
});

export const scrolling = style({
  blockSize: '100%',
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  // "safe": when the tiles overflow, start at the top instead of clipping it.
  alignContent: 'safe center',
  gap: cssVar(gridVars.gap),
  // The columns are counted in the width left after the inset.
  boxSizing: 'border-box',
  paddingInline: `${GRID_INSET}px`,
});

export const slot = style({
  selectors: {
    [`${scrolling} > &`]: {
      width: cssVar(gridVars.tileWidth),
      height: cssVar(gridVars.tileHeight),
    },
    [`${fixed} > &`]: {
      position: 'absolute',
      inlineSize: '404px',
      blockSize: '233px',
      // Within the safe area
      inset: `0 calc(env(safe-area-inset-right) + 12px) 0 calc(env(safe-area-inset-left) + 12px)`,
    },
    [`${fixed} > &[data-block-alignment="start"]`]: { insetBlockEnd: 'unset' },
    [`${fixed} > &[data-block-alignment="end"]`]: { insetBlockStart: 'unset' },
    [`${fixed} > &[data-inline-alignment="start"]`]: { insetInlineEnd: 'unset' },
    [`${fixed} > &[data-inline-alignment="end"]`]: { insetInlineStart: 'unset' },
  },
});

/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { style } from '@vanilla-extract/css';

import { pipAlignment } from './pipAlignment.css';

export const layer = style({
  blockSize: '100%',
});

export const spotlight = style({
  blockSize: '100%',
  inlineSize: '100%',
});

export const pip = style([
  pipAlignment,
  {
    position: 'absolute',
    inset: '16px',
    selectors: {
      '&[data-size="sm"]': { inlineSize: '88px', blockSize: '132px' },
      '&[data-size="lg"]': { inlineSize: '140px', blockSize: '210px' },
    },
  },
]);

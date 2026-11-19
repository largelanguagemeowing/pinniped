/*
Copyright 2024 New Vector Ltd.

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

// Within the safe area, kept clear of the edges.
const edge = '16px';

export const pip = style([
  pipAlignment,
  {
    position: 'absolute',
    inlineSize: '135px',
    blockSize: '160px',
    inset: `calc(env(safe-area-inset-top) + ${edge}) calc(env(safe-area-inset-right) + ${edge}) calc(env(safe-area-inset-bottom) + ${edge}) calc(env(safe-area-inset-left) + ${edge})`,
    '@media': {
      '(min-width: 600px)': {
        inlineSize: '180px',
        blockSize: '135px',
      },
    },
  },
]);

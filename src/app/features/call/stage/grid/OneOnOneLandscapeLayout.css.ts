/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { style } from '@vanilla-extract/css';

import { pipAlignment } from './pipAlignment.css';

export const layer = style({
  blockSize: '100%',
  display: 'grid',
  placeItems: 'center',
});

export const container = style({
  position: 'relative',
});

export const local = style([
  pipAlignment,
  {
    position: 'absolute',
    inlineSize: '180px',
    blockSize: '135px',
    inset: 0,
  },
]);

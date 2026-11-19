/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { style } from '@vanilla-extract/css';

export const tile = style({});

export const draggable = style({
  cursor: 'grab',
  boxShadow: '0px 0px 24px 0px #1b1d221a',
  selectors: {
    '&:active': { cursor: 'grabbing' },
  },
});

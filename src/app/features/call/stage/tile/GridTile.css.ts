/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { style } from '@vanilla-extract/css';
import { color } from 'folds';

import { mediaVars } from './MediaView.css';

export const tile = style({
  vars: { [mediaVars.borderRadius]: '16px' },
  transition: 'outline-color ease 0.15s',
  outline: '2px solid rgb(0 0 0 / 0)',
  selectors: {
    // The expressive speaking border, a pseudo-element since borders can't be gradients.
    '&::before': {
      content: '""',
      position: 'absolute',
      zIndex: -1, // below the outline
      opacity: 0, // hidden unless speaking
      transition: 'opacity ease 0.15s',
      inset: '-4px',
      borderRadius: '20px',
      backgroundBlendMode: 'overlay, normal',
    },
  },
  '@media': {
    '(hover: hover)': {
      selectors: {
        '&:hover': { outline: `2px solid ${color.SurfaceVariant.ContainerLine}` },
      },
    },
  },
});

export const speaking = style({
  // Takes priority over hover.
  outline: `1px solid ${color.Background.Container} !important`,
  selectors: {
    '&::before': {
      background:
        'linear-gradient(119deg, rgba(13, 92, 189, 0.7) 0%, rgba(13, 189, 168, 0.7) 100%), linear-gradient(180deg, rgba(13, 92, 189, 0.9) 0%, rgba(13, 189, 168, 0.9) 100%)',
      opacity: 1,
    },
  },
});

export const handRaised = style({
  // Takes priority over hover.
  outline: `2px solid ${color.Background.Container} !important`,
  selectors: {
    '&::before': {
      background:
        'linear-gradient(119deg, #b27500 0%, #e5a32a 100%), linear-gradient(180deg, #b27500 0%, #e5a32a 100%)',
      opacity: 1,
    },
  },
});

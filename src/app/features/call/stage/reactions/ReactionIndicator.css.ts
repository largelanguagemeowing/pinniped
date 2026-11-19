/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { style } from '@vanilla-extract/css';
import { config, toRem } from 'folds';

export const widget = style({
  display: 'flex',
  backgroundColor: '#00000030',
  borderRadius: config.radii.Pill,
  boxShadow: `0 0 ${config.space.S200} #00000040`,
  backdropFilter: 'blur(10px)',
  outline: '1px solid rgb(255 255 255 / 0.15)',
  outlineOffset: '-1px',
});

export const reaction = style({
  margin: config.space.S100,
  padding: config.space.S100,
  color: 'white',
  display: 'flex',
  alignItems: 'center',
  borderRadius: config.radii.Pill,
  userSelect: 'none',
  overflow: 'hidden',
  boxSizing: 'border-box',
  maxInlineSize: 'fit-content',
});

export const reactionLarge = style({
  margin: config.space.S200,
  padding: config.space.S400,
});

export const emoji = style({
  width: toRem(24),
  height: toRem(24),
  display: 'inline-block',
  textAlign: 'center',
  fontSize: '1.2em',
  lineHeight: 1.2,
  selectors: {
    [`${reactionLarge} > &`]: {
      width: toRem(30),
      height: toRem(30),
      fontSize: toRem(25),
    },
  },
});

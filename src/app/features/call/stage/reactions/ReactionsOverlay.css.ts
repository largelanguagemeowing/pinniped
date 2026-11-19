/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { keyframes, style } from '@vanilla-extract/css';

/** Covers the call view; reactions float up across it. */
export const container = style({
  position: 'absolute',
  inset: 0,
  zIndex: 2,
  overflow: 'hidden',
  pointerEvents: 'none',
});

const reactionUp = keyframes({
  from: { opacity: 1, scale: '200%', top: '80%' },
  to: { opacity: 0, scale: '100%', top: '0%' },
});

const reactionFade = keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

const reducedSize = '48pt';

export const reaction = style({
  position: 'absolute',
  top: '80%',
  width: 'fit-content',
  fontSize: '32pt',
  // Reactions are active for 3 seconds (REACTION_ACTIVE_TIME_MS); a bit longer to fade out.
  animationDuration: '4s',
  animationName: reactionUp,
  animationFillMode: 'forwards',
  '@media': {
    '(prefers-reduced-motion)': {
      fontSize: reducedSize,
      animationName: reactionFade,
      top: `calc(50% - ${reducedSize} / 2)`,
      left: `calc(50% - ${reducedSize} / 2) !important`,
    },
  },
});

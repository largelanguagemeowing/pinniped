/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { createContainer, createVar, globalStyle, style } from '@vanilla-extract/css';
import { color, config, toRem } from 'folds';

import { cssVar } from '../grid/vars';

/** Custom properties tiles set on their media view. */
export const mediaVars = {
  borderRadius: '--call-media-border-radius',
  /** Inset of the name tag and buttons from the tile's edge. */
  fgInset: '--call-media-fg-inset',
  /** Average colour of the avatar, tinting voice tiles. */
  avatarColor: '--call-media-avatar-color',
  background: '--call-media-background',
} as const;

const mediaContainer = createContainer();
const fgInset = createVar();

/** Set on the call view while the user is idle: labels fade away, muted indicators stay. */
const idle = '[data-call-stage][data-idle="true"]';

const voice = '[data-voice="true"]';

export const media = style({
  vars: { [mediaVars.background]: '#1e1f22' },
  containerName: mediaContainer,
  containerType: 'size',
  borderRadius: cssVar(mediaVars.borderRadius),
  // Tiles fill their slot exactly; the speaking ring is drawn inside the tile.
  margin: 0,
  display: 'grid',
  gridTemplateAreas: '"content"',
  placeItems: 'stretch',
  selectors: {
    [`&${voice}`]: {
      vars: { [mediaVars.background]: cssVar(mediaVars.avatarColor, '#2b2d31') },
      outline: 'none !important',
    },
    // The speaking ring of voice tiles sits inside the tile, so the frame edge the strip is
    // flush against cannot clip it.
    [`&${voice}::after`]: {
      content: '""',
      position: 'absolute',
      inset: 0,
      zIndex: 1,
      border: '3px solid rgb(61 158 96)',
      borderRadius: 'inherit',
      pointerEvents: 'none',
      opacity: 0,
      transition: 'opacity 0.15s ease',
    },
    [`&${voice}[data-pinniped-speaking="true"]::after`]: { opacity: 1 },
    [`&${voice}::before`]: { display: 'none' },
    // Clicking a participant tile focuses them.
    '&[data-pinniped-user-id]': { cursor: 'pointer' },
    // Screen shares are flush and edge-to-edge on black.
    '&[data-pinniped-live]': {
      vars: { [mediaVars.borderRadius]: '0', [mediaVars.background]: '#000' },
    },
    '&[data-pinniped-live]::after': {
      content: '"Live"',
      position: 'absolute',
      insetBlockStart: '12px',
      insetInlineEnd: '12px',
      padding: '2px 6px',
      borderRadius: '4px',
      background: '#f23f43',
      color: '#fff',
      fontSize: '11px',
      fontWeight: 700,
      lineHeight: '14px',
      textTransform: 'uppercase',
      pointerEvents: 'none',
    },
  },
});

export const mirror = style({});

globalStyle(`${media} video`, {
  inlineSize: '100%',
  blockSize: '100%',
  objectFit: 'contain',
  backgroundColor: cssVar(mediaVars.background),
  // A no-op that makes Firefox clip the corners of <video> elements to the rounded shape.
  transform: 'translate(0)',
});
globalStyle(`${mirror} video`, { transform: 'scaleX(-1)' });
globalStyle(`${media}[data-video-fit="cover"] video`, { objectFit: 'cover' });
globalStyle(`${media}[data-video-fit="contain"] video`, { objectFit: 'contain' });

export const bg = style({
  gridArea: 'content',
  backgroundColor: cssVar(mediaVars.background),
  inlineSize: '100%',
  blockSize: '100%',
  borderRadius: 'inherit',
  contain: 'strict',
});

export const avatar = style({
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none',
  '@container': {
    // Half of the smallest dimension of the tile, at most 80px on voice tiles.
    [`${mediaContainer} (width > 0)`]: {
      inlineSize: '50cqmin',
      blockSize: '50cqmin',
      selectors: {
        [`${media}${voice} &`]: {
          inlineSize: 'min(50cqmin, 80px)',
          blockSize: 'min(50cqmin, 80px)',
        },
      },
    },
  },
});

/** Over a status, the avatar is translucent so the status reads. */
export const translucent = style({
  opacity: '50%',
  mixBlendMode: 'multiply',
});

export const fg = style({
  gridArea: 'content',
  vars: {
    [fgInset]: cssVar(mediaVars.fgInset, `calc(${cssVar(mediaVars.borderRadius)} - 12px)`),
  },
  padding: fgInset,
  transition: 'padding 0.3s',
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gridTemplateRows: '1fr auto',
  gridTemplateAreas: '"status reactions" "nameTag button"',
  gap: config.space.S100,
  placeItems: 'start',
  contain: 'strict',
  '@media': {
    '(prefers-reduced-motion)': { transition: 'none' },
  },
});

export const nameTag = style({
  gridArea: 'nameTag',
  placeSelf: 'end start',
  padding: config.space.S100,
  color: color.Surface.OnContainer,
  backgroundColor: color.Surface.Container,
  display: 'flex',
  alignItems: 'center',
  borderRadius: config.radii.Pill,
  userSelect: 'none',
  overflow: 'hidden',
  boxShadow: '0px 1.2px 2.4px 0px rgba(0, 0, 0, 0.15)',
  boxSizing: 'border-box',
  maxInlineSize: '100%',
  transition: 'opacity 0.3s ease',
  selectors: {
    [`${media}${voice} &`]: {
      background: 'rgb(0 0 0 / 0.55)',
      color: '#fff',
      borderRadius: '6px',
    },
    [`${idle} &:not(:has([data-muted="true"]))`]: { opacity: 0 },
  },
});

globalStyle(`${nameTag} > svg, ${nameTag} > span`, { flexShrink: 0 });
// Voice tiles show the microphone only when it is off.
globalStyle(`${media}${voice} ${nameTag} [data-muted="false"]`, { display: 'none' });

export const name = style({
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  paddingInline: config.space.S200,
  selectors: {
    [`${nameTag} > &`]: { flexShrink: 1 },
    [`${idle} ${nameTag} > &`]: { display: 'none' },
  },
});

export const status = style({
  gridArea: 'status',
  color: color.Surface.OnContainer,
  display: 'flex',
  alignItems: 'center',
  gap: '3px',
  userSelect: 'none',
  overflow: 'hidden',
  marginBlockStart: `calc(12px - ${fgInset})`,
  marginInlineStart: `calc(16px - ${fgInset})`,
});

export const reactions = style({
  gridArea: 'reactions',
  placeSelf: 'start end',
  display: 'flex',
  gap: config.space.S100,
});

export const errorIcon = style({
  display: 'block',
  color: color.Critical.Main,
});

/** The tile's own button (menu, switch camera), shown on hover or focus. */
export const button = style({
  gridArea: 'button',
  placeSelf: 'end',
  appearance: 'none',
  border: 'none',
  borderRadius: config.radii.Pill,
  padding: config.space.S100,
  display: 'flex',
  background: color.Surface.Container,
  color: color.Surface.OnContainer,
  boxShadow: '0px 1.2px 2.4px 0px rgba(0, 0, 0, 0.15)',
  cursor: 'pointer',
  opacity: 0,
  transition: 'opacity 0.15s, background-color 0.1s',
  selectors: {
    [`${fg}:has(:focus-visible) > &, &[aria-expanded="true"]`]: { opacity: 1 },
    '&:active': { background: color.Surface.ContainerActive },
  },
  '@media': {
    '(hover)': {
      selectors: {
        [`${fg}:hover > &`]: { opacity: 1 },
        '&:hover': { background: color.Surface.ContainerHover },
      },
    },
  },
});

export const leadingIcon = style({
  width: toRem(20),
  height: toRem(20),
  selectors: {
    '&[data-muted="true"]': { color: color.Critical.Main },
  },
});

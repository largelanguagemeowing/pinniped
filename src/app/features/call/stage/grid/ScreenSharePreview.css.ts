/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { globalStyle, style } from '@vanilla-extract/css';
import { toRem } from 'folds';

import { cssVar, gridVars, stripVars } from './vars';

export const preview = style({
  position: 'relative',
  // The layout layer ignores the pointer; take hover so the Hide Members pill shows.
  pointerEvents: 'auto',
  inlineSize: cssVar(stripVars.tileWidth, '195px'),
  blockSize: cssVar(stripVars.tileHeight, '112px'),
  borderRadius: '8px',
  overflow: 'hidden',
  background: '#000',
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
  // A button (click to focus the stream) without the button chrome.
  border: 'none',
  padding: 0,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
});

export const video = style({
  position: 'absolute',
  inset: 0,
  inlineSize: '100%',
  blockSize: '100%',
  objectFit: 'cover',
  opacity: 0.5,
  filter: 'blur(2px)',
});

export const icon = style({
  position: 'relative',
  color: '#fff',
  width: toRem(40),
  height: toRem(40),
});

export const live = style({
  position: 'absolute',
  insetBlockStart: '8px',
  insetInlineEnd: '8px',
  padding: '2px 6px',
  borderRadius: '4px',
  background: '#f23f43',
  color: '#fff',
  fontSize: '11px',
  fontWeight: 700,
  lineHeight: '14px',
  textTransform: 'uppercase',
});

export const name = style({
  position: 'absolute',
  insetBlockEnd: '8px',
  insetInlineStart: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  maxInlineSize: 'calc(100% - 16px)',
  padding: '2px 8px',
  borderRadius: '6px',
  background: 'rgb(0 0 0 / 0.55)',
  color: '#fff',
  fontSize: '14px',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
});

/** The grid layout's stream tile, sized like the other grid tiles. */
export const gridTile = style({
  inlineSize: cssVar(gridVars.tileWidth),
  blockSize: cssVar(gridVars.tileHeight),
  borderRadius: '16px',
});

globalStyle(`${gridTile} ${video}`, {
  objectFit: 'contain',
  opacity: 1,
  filter: 'none',
});

globalStyle(`${gridTile} ${icon}`, { display: 'none' });

globalStyle(`${gridTile} ${name}`, {
  insetBlockEnd: '12px',
  insetInlineStart: '12px',
});

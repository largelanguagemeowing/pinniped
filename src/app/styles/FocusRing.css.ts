import { globalStyle } from '@vanilla-extract/css';
import { color, FocusOutline, toRem } from 'folds';
import { inputModeSelector } from '../utils/inputMode';

export const FocusRingOutline = `${toRem(2)} solid ${color.Other.FocusRing}`;
export const FocusRingOffset = toRem(2);

const keyboard = inputModeSelector('keyboard');
const pointer = inputModeSelector('pointer');

// Replaces the browser's ring on every focusable element; zero specificity so an element's own
// focus style (or `outline: none`, as on text fields) wins.
globalStyle(`:where(${keyboard} :focus-visible)`, {
  outline: FocusRingOutline,
  outlineOffset: FocusRingOffset,
});
globalStyle(`:where(${pointer} :focus-visible)`, {
  outline: 'none',
});

// folds controls (buttons, chips, menu items, avatars, ...)
globalStyle(`${keyboard} .${FocusOutline}:focus-visible`, {
  outline: FocusRingOutline,
  outlineOffset: FocusRingOffset,
});
globalStyle(`${pointer} .${FocusOutline}:focus-visible`, {
  outline: 'none',
});

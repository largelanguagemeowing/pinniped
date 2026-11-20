/*
Copyright 2025 Element Creations Ltd.
Copyright 2023, 2024, 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

/** The general shape of the call view; the call picks its layouts by it. */
export type WindowMode = 'normal' | 'narrow' | 'flat' | 'pip';

/** A guess at the window mode from the size and shape of the call view. */
export function naturalWindowMode({
  width,
  height,
}: {
  width: number;
  height: number;
}): WindowMode {
  if (height <= 400 && width <= 340) return 'pip';
  // Our layouts for flat windows are better at adapting to a small width
  // than our layouts for narrow windows are at adapting to a small height,
  // so we give "flat" precedence here
  // Pinniped: the call lives in a pane inside the app, so a short view is
  // normal. Never switch to the "flat" (edge-to-edge PiP) layout.
  // Pinniped: a small landscape pane keeps the stream with the
  // participant strip below; only phone-like portrait panes go "narrow".
  if (width <= 600 && height > width) return 'narrow';
  return 'normal';
}

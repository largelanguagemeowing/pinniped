/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  atomWithLocalStorage,
  getLocalStorageItem,
  setLocalStorageItem,
} from '../../state/utils/atomWithLocalStorage';
import {
  DEFAULT_PIP_CORNER,
  PIP_DEFAULT_WIDTH,
  isPipCorner,
  snapPipWidth,
  type PipCorner,
} from './pipGeometry';

/** The corner the floating call window rests in; remembered across sessions. */
export const pipCornerAtom = atomWithLocalStorage<PipCorner>(
  'pipCorner',
  (key) => {
    const stored = getLocalStorageItem<unknown>(key, DEFAULT_PIP_CORNER);
    return isPipCorner(stored) ? stored : DEFAULT_PIP_CORNER;
  },
  setLocalStorageItem
);

/** The floating call window's width in px; remembered across sessions. */
export const pipWidthAtom = atomWithLocalStorage<number>(
  'pipWidth',
  (key) => {
    const stored = getLocalStorageItem<unknown>(key, PIP_DEFAULT_WIDTH);
    return typeof stored === 'number' ? snapPipWidth(stored) : PIP_DEFAULT_WIDTH;
  },
  setLocalStorageItem
);

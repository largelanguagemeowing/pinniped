/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Observable } from "rxjs";
import { type ComponentType } from "react";

import { type LayoutProps } from "./Grid";
import { type TileViewModel } from "../state/TileViewModel";

export interface Bounds {
  width: number;
  height: number;
}

export interface CallLayoutInputs {
  /**
   * The minimum bounds of the layout area.
   */
  minBounds$: Observable<Bounds>;
}

export interface CallLayoutOutputs<Model> {
  /**
   * Which layer should appear in the foreground.
   */
  foreground: "fixed" | "scrolling";
  /**
   * The visually fixed (non-scrolling) layer of the layout.
   */
  fixed: ComponentType<LayoutProps<Model, TileViewModel, HTMLDivElement>>;
  /**
   * The layer of the layout that can overflow and be scrolled.
   */
  scrolling: ComponentType<LayoutProps<Model, TileViewModel, HTMLDivElement>>;
}

/**
 * A layout system for media tiles.
 */
export type CallLayout<Model> = (
  inputs: CallLayoutInputs,
) => CallLayoutOutputs<Model>;

export interface GridArrangement {
  tileWidth: number;
  tileHeight: number;
  gap: number;
  columns: number;
}

const tileMaxAspectRatio = 17 / 9;
const tileMinAspectRatio = 4 / 3;

/**
 * Determine the ideal arrangement of tiles into a grid of a particular size.
 */
export function arrangeTiles(
  width: number,
  minHeight: number,
  tileCount: number,
): GridArrangement {
  const gap = width < 800 ? 16 : 20;
  // Nothing to lay out, or no room to do it in (an unmeasured or collapsed
  // window). The maths below divides by the height and by the column count,
  // which come out as 0 here and would give NaN or Infinity tile sizes.
  if (tileCount < 1 || width < 1 || minHeight < 1)
    return { tileWidth: 0, tileHeight: 0, gap, columns: 1 };

  // The goal here is to determine the grid size and padding that maximizes
  // use of screen space for n tiles without making those tiles too small or
  // too cropped (having an extreme aspect ratio)
  const area = width * minHeight;
  // Magic numbers that make tiles scale up nicely as the window gets larger
  const tileArea = Math.pow(Math.sqrt(area) / 8 + 125, 2);
  // Always show at least one tile, however small the window is
  const tilesPerPage = Math.max(1, Math.min(tileCount, area / tileArea));

  // At least one column: in a very narrow or short window the rounding below
  // reaches 0, and the row count (tilesPerPage / columns) would be Infinity.
  let columns = Math.max(
    1,
    Math.min(
      // Don't create more columns than we have items for
      tilesPerPage,
      // The ideal number of columns is given by a packing of equally-sized
      // squares into a grid.
      // width / column = height / row.
      // columns * rows = number of squares.
      // ∴ columns = sqrt(width / height * number of squares).
      // Except we actually want 16:9-ish tiles rather than squares, so we
      // divide the width-to-height ratio by the target aspect ratio.
      Math.round(
        Math.sqrt((width / minHeight / tileMinAspectRatio) * tilesPerPage),
      ),
    ),
  );
  let rows = tilesPerPage / columns;
  // If all the tiles could fit on one page, we want to ensure that they do by
  // not leaving fractional rows hanging off the bottom
  if (tilesPerPage === tileCount) {
    rows = Math.ceil(rows);
    // We may now be able to fit the tiles into fewer columns
    columns = Math.ceil(tileCount / rows);
  }

  let tileWidth = (width - (columns + 1) * gap) / columns;
  let tileHeight = (minHeight - (rows - 1) * gap) / rows;

  // Impose a minimum and maximum aspect ratio on the tiles
  const tileAspectRatio = tileWidth / tileHeight;
  if (tileAspectRatio > tileMaxAspectRatio)
    tileWidth = tileHeight * tileMaxAspectRatio;
  else if (tileAspectRatio < tileMinAspectRatio)
    tileHeight = tileWidth / tileMinAspectRatio;

  // The gaps alone can be wider than a tiny window; never go negative.
  return {
    tileWidth: Math.max(0, tileWidth),
    tileHeight: Math.max(0, tileHeight),
    gap,
    columns,
  };
}

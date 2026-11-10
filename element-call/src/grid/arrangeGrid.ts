/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type GridArrangement } from "./CallLayout";

/** Every tile is 16:9. */
export const GRID_TILE_ASPECT = 16 / 9;
/** Space between tiles, in both directions. */
export const GRID_GAP = 8;
/** Space kept free on each side of the grid. */
export const GRID_INSET = 8;
/**
 * Above this many tiles the grid stops shrinking tiles to fit everything on
 * one screen: it keeps tiles big enough for this many and scrolls the rest.
 */
export const GRID_MAX_VISIBLE = 25;

/** How many tiles of width `w` fit side by side in `available`. */
function columnsFor(w: number, available: number): number {
  return Math.max(1, Math.floor((available - w) / (GRID_GAP + w)) + 1);
}

/** How many rows of tiles of width `w` fit in `available`. */
function rowsFor(
  w: number,
  available: number,
  round: (n: number) => number,
): number {
  const h = w / GRID_TILE_ASPECT;
  return round((available - h) / (GRID_GAP + h)) + 1;
}

/**
 * The first integer in [lo, hi) for which `holds` is false, or `hi` if it holds
 * throughout. `holds` must be true for small values and false for large ones.
 */
function firstFailing(
  lo: number,
  hi: number,
  holds: (n: number) => boolean,
): number {
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (holds(mid)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Lay `tileCount` 16:9 tiles out in a wrapping grid, using the widest tile that
 * still fits them all in `width` × `height`. Past `GRID_MAX_VISIBLE` tiles the
 * tile size stops shrinking and the grid scrolls instead.
 *
 * The caller is expected to draw the tiles in a centred, wrapping flex row
 * that has `GRID_INSET` of padding on each side.
 */
export function arrangeGrid(
  width: number,
  height: number,
  tileCount: number,
): GridArrangement {
  const available = width - 2 * GRID_INSET;
  if (tileCount < 1 || available < 1 || height < 1) {
    return { tileWidth: 0, tileHeight: 0, gap: GRID_GAP, columns: 1 };
  }

  const lo = Math.max(1, Math.floor(available / GRID_MAX_VISIBLE));
  let tileWidth: number;
  if (tileCount > GRID_MAX_VISIBLE) {
    // Smallest tile that no longer lets a screenful hold more than the cap.
    tileWidth = firstFailing(
      lo,
      available,
      (w) =>
        columnsFor(w, available) * rowsFor(w, height, Math.ceil) >
        GRID_MAX_VISIBLE,
    );
  } else {
    // Largest tile for which everything still fits on screen.
    tileWidth =
      firstFailing(
        lo,
        available,
        (w) =>
          columnsFor(w, available) * rowsFor(w, height, Math.floor) >=
          tileCount,
      ) - 1;
  }
  tileWidth = Math.max(1, tileWidth);

  return {
    tileWidth,
    tileHeight: Math.floor(tileWidth / GRID_TILE_ASPECT),
    gap: GRID_GAP,
    columns: columnsFor(tileWidth, available),
  };
}

/** Smallest tile the portrait layout will shrink to before it scrolls instead. */
export const SPOTLIGHT_GRID_MIN_TILE_WIDTH = 96;
/** Gap between the spotlight and the grid below it. */
export const SPOTLIGHT_MARGIN = 16;
/** Extra room the spotlight reserves when it shows its page indicators. */
export const SPOTLIGHT_INDICATORS_MARGIN = 18;

/**
 * Lay the participant grid out underneath a full-width 16:9 spotlight tile so
 * that, whenever the tiles can reasonably fit, the whole stage fits without
 * scrolling. The grid gets the height the spotlight leaves over. Tiles never
 * shrink below `SPOTLIGHT_GRID_MIN_TILE_WIDTH`; past that the grid overflows
 * and scrolls behind the spotlight.
 */
export function arrangeBelowSpotlight(
  width: number,
  height: number,
  tileCount: number,
  withIndicators: boolean,
): GridArrangement {
  const spotlightHeight = width / GRID_TILE_ASPECT;
  const margin =
    SPOTLIGHT_MARGIN + (withIndicators ? SPOTLIGHT_INDICATORS_MARGIN : 0);
  const a = arrangeGrid(width, height - spotlightHeight - margin, tileCount);
  if (tileCount < 1 || width - 2 * GRID_INSET < 1) return a;

  // Never wider than the room there is: a tile forced past the edge would be
  // squashed out of 16:9 by the flex row it sits in.
  const available = width - 2 * GRID_INSET;
  const tileWidth = Math.max(
    a.tileWidth,
    Math.min(SPOTLIGHT_GRID_MIN_TILE_WIDTH, Math.floor(available)),
  );
  return {
    ...a,
    tileWidth,
    tileHeight: Math.floor(tileWidth / GRID_TILE_ASPECT),
    columns: columnsFor(tileWidth, available),
  };
}

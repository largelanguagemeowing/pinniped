/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { arrangeTiles } from "./CallLayout";
import {
  arrangeBelowSpotlight,
  arrangeGrid,
  SPOTLIGHT_GRID_MIN_TILE_WIDTH,
  SPOTLIGHT_INDICATORS_MARGIN,
  SPOTLIGHT_MARGIN,
  GRID_GAP,
  GRID_INSET,
  GRID_MAX_VISIBLE,
  GRID_TILE_ASPECT,
} from "./arrangeGrid";

/** Total size of the tiles as the flex row would lay them out. */
function footprint(
  width: number,
  tileCount: number,
  a: ReturnType<typeof arrangeGrid>,
): { w: number; h: number } {
  const columns = Math.min(a.columns, tileCount);
  const rows = Math.ceil(tileCount / a.columns);
  return {
    w: columns * a.tileWidth + (columns - 1) * GRID_GAP,
    h: rows * a.tileHeight + (rows - 1) * GRID_GAP,
  };
}

describe("arrangeGrid", () => {
  it("matches the sizes measured in a real 2-tile call", () => {
    // A 904×701 stage whose overlay controls reserve 64px above and below the
    // grid, so the grid itself gets 904×573. Two tiles stack at 502×282.
    const a = arrangeGrid(904, 573, 2);
    expect(a.columns).toBe(1);
    expect(a.tileWidth).toBe(502);
    expect(a.tileHeight).toBe(282);
  });

  it("fills a lone tile as large as the stage allows", () => {
    const a = arrangeGrid(900, 700, 1);
    expect(a.columns).toBe(1);
    // Limited by width here: the 16:9 height still fits in 700.
    expect(a.tileWidth).toBe(900 - 2 * GRID_INSET - 1);
  });

  it("lays tiles side by side when the stage is wide", () => {
    const a = arrangeGrid(1600, 400, 2);
    expect(a.columns).toBe(2);
  });

  it.each([1, 2, 3, 5, 9, 16, 25])(
    "fits %i tiles inside the stage",
    (count) => {
      const width = 1280;
      const height = 720;
      const a = arrangeGrid(width, height, count);
      const f = footprint(width, count, a);
      expect(f.w).toBeLessThanOrEqual(width - 2 * GRID_INSET);
      expect(f.h).toBeLessThanOrEqual(height);
      expect(a.tileWidth / a.tileHeight).toBeCloseTo(GRID_TILE_ASPECT, 1);
    },
  );

  it("never shrinks tiles as the stage grows", () => {
    let last = 0;
    for (let w = 400; w <= 2000; w += 100) {
      const a = arrangeGrid(w, w * 0.6, 7);
      expect(a.tileWidth).toBeGreaterThanOrEqual(last);
      last = a.tileWidth;
    }
  });

  it("stops shrinking tiles past the visible cap and scrolls instead", () => {
    const atCap = arrangeGrid(1280, 720, GRID_MAX_VISIBLE);
    const over = arrangeGrid(1280, 720, GRID_MAX_VISIBLE + 20);
    const wayOver = arrangeGrid(1280, 720, GRID_MAX_VISIBLE + 100);
    expect(over.tileWidth).toBeGreaterThanOrEqual(atCap.tileWidth - 1);
    expect(wayOver.tileWidth).toBe(over.tileWidth);
  });

  it("copes with an unmeasured or empty stage", () => {
    expect(arrangeGrid(0, 0, 3).tileWidth).toBe(0);
    expect(arrangeGrid(1280, 720, 0).tileWidth).toBe(0);
    expect(arrangeGrid(10, 720, 3).tileWidth).toBe(0);
    expect(arrangeGrid(1280, 0, 3).tileWidth).toBe(0);
  });

  it("never overflows the width, and keeps the tile 16:9, across sizes", () => {
    for (let width = 320; width <= 2560; width += 160) {
      for (let height = 240; height <= 1440; height += 120) {
        for (let count = 1; count <= GRID_MAX_VISIBLE; count++) {
          const a = arrangeGrid(width, height, count);
          const label = `${width}x${height} n=${count}`;
          const f = footprint(width, count, a);
          // The grid only guarantees everything fits when a tile of the
          // minimum width (width / cap) can fit; below that it clamps.
          if (a.tileWidth > Math.max(1, Math.floor((width - 16) / 25))) {
            expect(f.w, label).toBeLessThanOrEqual(width - 2 * GRID_INSET);
            expect(f.h, label).toBeLessThanOrEqual(height);
          }
          expect(a.columns, label).toBeGreaterThanOrEqual(1);
          expect(a.tileHeight, label).toBe(
            Math.floor(a.tileWidth / GRID_TILE_ASPECT),
          );
        }
      }
    }
  });

  it("picks the largest tile that fits (one pixel wider would not)", () => {
    for (const [width, height, count] of [
      [904, 573, 2],
      [1280, 720, 4],
      [1280, 720, 7],
      [800, 600, 9],
      [1920, 1080, 12],
    ] as const) {
      const a = arrangeGrid(width, height, count);
      const w = a.tileWidth + 1;
      const available = width - 2 * GRID_INSET;
      const columns = Math.max(
        1,
        Math.floor((available - w) / (GRID_GAP + w)) + 1,
      );
      const h = w / GRID_TILE_ASPECT;
      const rows = Math.floor((height - h) / (GRID_GAP + h)) + 1;
      expect(columns * rows, `${width}x${height} n=${count}`).toBeLessThan(
        count,
      );
    }
  });
});

describe("arrangeBelowSpotlight", () => {
  // A phone-ish call widget: 370 wide, 520 tall.
  const width = 370;
  const height = 520;

  /** Content height: spotlight, its margin, then the rows of tiles. */
  function contentHeight(count: number, withIndicators: boolean): number {
    const a = arrangeBelowSpotlight(width, height, count, withIndicators);
    const rows = Math.ceil(count / a.columns);
    return (
      width / GRID_TILE_ASPECT +
      SPOTLIGHT_MARGIN +
      (withIndicators ? SPOTLIGHT_INDICATORS_MARGIN : 0) +
      rows * a.tileHeight +
      (rows - 1) * GRID_GAP
    );
  }

  it.each([1, 2, 3, 4, 6])(
    "fits the spotlight and %i tiles without scrolling",
    (count) => {
      expect(contentHeight(count, false)).toBeLessThanOrEqual(height);
      expect(contentHeight(count, true)).toBeLessThanOrEqual(height);
    },
  );

  it("shrinks the tiles as more arrive, down to a floor", () => {
    const few = arrangeBelowSpotlight(width, height, 2, false).tileWidth;
    const many = arrangeBelowSpotlight(width, height, 12, false).tileWidth;
    expect(many).toBeLessThan(few);
    expect(many).toBeGreaterThanOrEqual(SPOTLIGHT_GRID_MIN_TILE_WIDTH);
  });

  it("keeps the minimum tile and scrolls when there is no room left", () => {
    // The 16:9 spotlight alone takes 208 of 220.
    const a = arrangeBelowSpotlight(width, 220, 4, false);
    expect(a.tileWidth).toBe(SPOTLIGHT_GRID_MIN_TILE_WIDTH);
    expect(a.tileHeight).toBe(
      Math.floor(SPOTLIGHT_GRID_MIN_TILE_WIDTH / GRID_TILE_ASPECT),
    );
  });

  it("gives smaller tiles when the spotlight shows its indicators", () => {
    const plain = arrangeBelowSpotlight(width, height, 4, false).tileWidth;
    const withDots = arrangeBelowSpotlight(width, height, 4, true).tileWidth;
    expect(withDots).toBeLessThanOrEqual(plain);
  });

  it("copes with no tiles or an unmeasured stage", () => {
    expect(arrangeBelowSpotlight(width, height, 0, false).tileWidth).toBe(0);
    expect(arrangeBelowSpotlight(0, 0, 3, false).tileWidth).toBe(0);
  });
});

describe("every arrangement stays finite in tiny or collapsed windows", () => {
  const sizes = [-50, 0, 1, 15, 16, 17, 40, 77, 78, 100, 200, 400];
  const counts = [0, 1, 2, 5, 30];
  const arrangers = {
    arrangeTiles,
    arrangeGrid,
    arrangeBelowSpotlight: (w: number, h: number, n: number) =>
      arrangeBelowSpotlight(w, h, n, false),
  };

  it.each(Object.keys(arrangers))("%s", (name) => {
    const arrange = arrangers[name as keyof typeof arrangers];
    for (const w of sizes)
      for (const h of sizes)
        for (const n of counts) {
          const a = arrange(w, h, n);
          const label = `${name} ${w}x${h} n=${n}`;
          for (const [key, value] of Object.entries(a)) {
            expect(Number.isFinite(value), `${label} ${key}=${value}`).toBe(
              true,
            );
            if (key !== "gap")
              expect(value, `${label} ${key}`).toBeGreaterThanOrEqual(0);
          }
          expect(a.columns, label).toBeGreaterThanOrEqual(1);
        }
  });

  it("never makes a tile wider than the room it has", () => {
    for (const width of [24, 40, 60, 80, 100, 112, 120]) {
      const a = arrangeBelowSpotlight(width, 400, 4, false);
      expect(a.tileWidth, `width ${width}`).toBeLessThanOrEqual(
        Math.max(0, width - 2 * GRID_INSET),
      );
      expect(a.tileHeight, `width ${width}`).toBe(
        Math.floor(a.tileWidth / GRID_TILE_ASPECT),
      );
    }
  });
});

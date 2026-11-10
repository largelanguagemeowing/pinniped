/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { arrangeTiles } from "./CallLayout";
import {
  arrangeBelowSpotlight,
  arrangeStrip,
  planStrip,
  STRIP_MAX_TILES,
  STRIP_GAP,
  STRIP_HEIGHT,
  STRIP_MAX_TILE_WIDTH,
  STRIP_MIN_TILE_WIDTH,
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

describe("arrangeStrip", () => {
  /** How wide the row of tiles is, including the gap kept free at each end. */
  const rowWidth = (count: number, tileWidth: number): number =>
    count * tileWidth + (count + 1) * STRIP_GAP;

  it("shrinks the tiles so that six of them fit a 1140px-wide stage", () => {
    // Six tiles at the full size would need 1210px and the last would be cut off.
    const { tileWidth, tileHeight } = arrangeStrip(1140, 6);
    expect(tileWidth).toBeLessThan(STRIP_MAX_TILE_WIDTH);
    expect(rowWidth(6, tileWidth)).toBeLessThanOrEqual(1140);
    expect(tileHeight).toBeLessThanOrEqual(STRIP_HEIGHT);
  });

  it("splits the width evenly: (width - gap) / count - gap", () => {
    for (const width of [500, 800, 1140, 1600])
      for (let count = 1; count <= 12; count++) {
        const fit = (width - 8) / count - 8;
        if (fit < STRIP_MIN_TILE_WIDTH || fit > STRIP_MAX_TILE_WIDTH) continue;
        expect(
          arrangeStrip(width, count).tileWidth,
          `${width} n=${count}`,
        ).toBe(Math.floor(fit));
      }
  });

  it("keeps tiles at full size while there is room", () => {
    expect(arrangeStrip(1600, 3).tileWidth).toBe(STRIP_MAX_TILE_WIDTH);
    expect(arrangeStrip(1600, 1).tileWidth).toBe(STRIP_MAX_TILE_WIDTH);
  });

  it("stops shrinking at the minimum, and lets the strip scroll", () => {
    expect(arrangeStrip(600, 12).tileWidth).toBe(STRIP_MIN_TILE_WIDTH);
    expect(arrangeStrip(300, 4).tileWidth).toBe(STRIP_MIN_TILE_WIDTH);
  });

  it("keeps tiles 16:9 and never taller than the strip", () => {
    for (const width of [0, 1, 200, 700, 1140, 2000])
      for (const count of [0, 1, 2, 6, 12, 30]) {
        const a = arrangeStrip(width, count);
        expect(Number.isFinite(a.tileWidth)).toBe(true);
        expect(a.tileHeight).toBeLessThanOrEqual(STRIP_HEIGHT);
        expect(a.tileHeight).toBe(Math.floor(a.tileWidth / GRID_TILE_ASPECT));
      }
  });
});

describe("planStrip", () => {
  it("shows everyone when they fit", () => {
    const p = planStrip(1140, 2, 4);
    expect(p.shares).toBe(2);
    expect(p.people).toBe(4);
  });

  it("shows only as many as fit at the minimum width, and drops the rest", () => {
    // 1140px holds eight 124px tiles, so the ninth person is left out.
    const p = planStrip(1140, 0, 9);
    expect(p.people).toBe(8);
    expect(p.tileWidth).toBeGreaterThanOrEqual(STRIP_MIN_TILE_WIDTH);
  });

  it("keeps the screen shares and trims the people", () => {
    const p = planStrip(1140, 2, 9);
    expect(p.shares).toBe(2);
    expect(p.people).toBe(6);
  });

  it("never shows more than the cap, however wide it is", () => {
    const p = planStrip(5000, 0, 30);
    expect(p.people).toBe(STRIP_MAX_TILES);
  });

  it("keeps the tiles of a full strip inside the width", () => {
    for (const width of [300, 500, 700, 1140, 1600, 2400])
      for (const people of [1, 3, 8, 15, 40]) {
        const p = planStrip(width, 0, people);
        const row = p.people * p.tileWidth + (p.people + 1) * STRIP_GAP;
        // Only a window narrower than a single minimum tile can overflow.
        if (width >= STRIP_MIN_TILE_WIDTH + 2 * STRIP_GAP)
          expect(row, `${width} n=${people}`).toBeLessThanOrEqual(width);
      }
  });

  it("shows at least one tile in a very narrow window", () => {
    expect(planStrip(60, 0, 5).people).toBe(1);
    expect(planStrip(60, 3, 5).shares).toBe(1);
  });

  it("copes with nothing to show or no width", () => {
    expect(planStrip(1140, 0, 0)).toMatchObject({ shares: 0, people: 0 });
    expect(Number.isFinite(planStrip(0, 0, 0).tileWidth)).toBe(true);
  });
});

// @vitest-environment node
/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Browser, chromium } from "@playwright/test";

import {
  arrangeBelowSpotlight,
  planStrip,
  arrangeGrid,
  GRID_INSET,
  GRID_MAX_VISIBLE,
} from "./arrangeGrid";

/**
 * Renders the real GridLayout stylesheet in Chromium and checks that the browser
 * lays the tiles out the way `arrangeGrid` says it will. jsdom has no layout, so
 * this is the only place the padding, gap and wrapping are exercised together.
 * Skipped when no Chromium is available.
 */
const css = readFileSync(
  fileURLToPath(new URL("./GridLayout.module.css", import.meta.url)),
  "utf8",
);

const portraitCss = readFileSync(
  fileURLToPath(
    new URL("./SpotlightPortraitLayout.module.css", import.meta.url),
  ),
  "utf8",
);

const landscapeCss = readFileSync(
  fileURLToPath(
    new URL("./SpotlightLandscapeLayout.module.css", import.meta.url),
  ),
  "utf8",
);

let browser: Browser | undefined;

beforeAll(async () => {
  try {
    browser = await chromium.launch();
  } catch {
    browser = undefined;
  }
});

afterAll(async () => {
  await browser?.close();
});

interface Measured {
  columns: number;
  rows: number;
  overlaps: boolean;
  overflowsX: boolean;
  scrollHeight: number;
  firstTop: number;
  lastBottom: number;
  tileWidth: number;
  tileHeight: number;
}

async function measure(
  width: number,
  height: number,
  count: number,
): Promise<Measured> {
  const a = arrangeGrid(width, height, count);
  const page = await browser!.newPage({ viewport: { width, height } });
  try {
    const tiles = Array.from(
      { length: count },
      () => '<div class="slot"></div>',
    );
    await page.setContent(`<!doctype html><style>${css}
      html,body{margin:0}
      .host{width:${width}px;height:${height}px;overflow-y:auto;overflow-x:hidden}
      .scrolling > .slot{background:#888}
    </style>
    <div class="host"><div class="scrolling" style="width:${width}px;--gap:${a.gap}px;--width:${a.tileWidth}px;--height:${a.tileHeight}px">${tiles.join("")}</div></div>`);
    return await page.evaluate(() => {
      const host = document.querySelector(".host")!;
      const rects = [...document.querySelectorAll(".slot")].map((e) =>
        e.getBoundingClientRect(),
      );
      const perRow = new Map<number, number>();
      for (const r of rects)
        perRow.set(Math.round(r.top), (perRow.get(Math.round(r.top)) ?? 0) + 1);
      let overlaps = false;
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++) {
          const p = rects[i],
            q = rects[j];
          if (
            p.left < q.right - 0.5 &&
            q.left < p.right - 0.5 &&
            p.top < q.bottom - 0.5 &&
            q.top < p.bottom - 0.5
          )
            overlaps = true;
        }
      return {
        columns: Math.max(...perRow.values()),
        rows: perRow.size,
        overlaps,
        overflowsX: host.scrollWidth > host.clientWidth,
        scrollHeight: host.scrollHeight,
        firstTop: Math.min(...rects.map((r) => r.top)),
        lastBottom: Math.max(...rects.map((r) => r.bottom)),
        tileWidth: rects[0].width,
        tileHeight: rects[0].height,
      };
    });
  } finally {
    await page.close();
  }
}

const sizes: [number, number][] = [
  [904, 573],
  [1280, 720],
  [640, 480],
  [1920, 1080],
  [420, 700],
];
const counts = [1, 2, 3, 4, 5, 7, 9, 12, 25];

describe("GridLayout stylesheet in Chromium", () => {
  it.each(sizes.flatMap(([w, h]) => counts.map((n) => [w, h, n] as const)))(
    "%ix%i with %i tiles wraps as predicted",
    async (width, height, count) => {
      if (!browser) return; // no Chromium here
      const a = arrangeGrid(width, height, count);
      const m = await measure(width, height, count);
      const label = `${width}x${height} n=${count}`;

      expect(m.tileWidth, label).toBe(a.tileWidth);
      expect(m.overlaps, label).toBe(false);
      expect(m.overflowsX, label).toBe(false);
      expect(m.columns, label).toBe(Math.min(a.columns, count));
      expect(m.rows, label).toBe(Math.ceil(count / a.columns));
      // Everything that is meant to fit on one screen does, with no scrolling.
      if (count <= GRID_MAX_VISIBLE && a.tileWidth > width / 25) {
        expect(m.scrollHeight, label).toBeLessThanOrEqual(height);
        expect(m.firstTop, label).toBeGreaterThanOrEqual(0);
        expect(m.lastBottom, label).toBeLessThanOrEqual(height + 0.5);
      }
    },
  );

  it("keeps the first row reachable when tiles overflow", async () => {
    if (!browser) return;
    const m = await measure(1280, 400, 60);
    // `align-content: safe center` must not push the top row above the scroller.
    expect(m.firstTop).toBeGreaterThanOrEqual(0);
    expect(m.scrollHeight).toBeGreaterThan(400);
  });

  it("keeps the inset free on both sides", async () => {
    if (!browser) return;
    const width = 1280;
    const a = arrangeGrid(width, 720, 6);
    const page = await browser.newPage({ viewport: { width, height: 720 } });
    try {
      await page.setContent(`<!doctype html><style>${css}html,body{margin:0}</style>
        <div style="width:${width}px;height:720px"><div class="scrolling" style="width:${width}px;--gap:${a.gap}px;--width:${a.tileWidth}px;--height:${a.tileHeight}px">${'<div class="slot"></div>'.repeat(6)}</div></div>`);
      const { left, right } = await page.evaluate((w) => {
        const r = [...document.querySelectorAll(".slot")].map((e) =>
          e.getBoundingClientRect(),
        );
        return {
          left: Math.min(...r.map((x) => x.left)),
          right: w - Math.max(...r.map((x) => x.right)),
        };
      }, width);
      expect(left).toBeGreaterThanOrEqual(GRID_INSET - 0.5);
      expect(right).toBeGreaterThanOrEqual(GRID_INSET - 0.5);
    } finally {
      await page.close();
    }
  });
});

describe("SpotlightPortraitLayout stylesheet in Chromium", () => {
  async function render(
    width: number,
    height: number,
    count: number,
    withIndicators: boolean,
  ): Promise<{ contentHeight: number; scrolls: boolean; lastBottom: number }> {
    const a = arrangeBelowSpotlight(width, height, count, withIndicators);
    const page = await browser!.newPage({ viewport: { width, height } });
    try {
      await page.setContent(`<!doctype html><style>${portraitCss}
        html,body{margin:0}
        :root{--cpd-space-4x:16px}
        .host{width:${width}px;height:${height}px;overflow-y:auto;overflow-x:hidden}
      </style>
      <div class="host"><div class="layer" style="--grid-gap:${a.gap}px;--grid-tile-width:${a.tileWidth}px;--grid-tile-height:${a.tileHeight}px">
        <div class="spotlight${withIndicators ? " withIndicators" : ""}"></div>
        <div class="grid">${'<div class="slot"></div>'.repeat(count)}</div>
      </div></div>`);
      return await page.evaluate(() => {
        const host = document.querySelector(".host")!;
        const slots = [...document.querySelectorAll(".grid > .slot")];
        return {
          contentHeight: host.scrollHeight,
          scrolls: host.scrollHeight > host.clientHeight,
          lastBottom: Math.max(
            ...slots.map((e) => e.getBoundingClientRect().bottom),
          ),
        };
      });
    } finally {
      await page.close();
    }
  }

  it.each([
    [370, 520, 2, false],
    [370, 520, 4, false],
    [370, 520, 4, true],
    [370, 640, 6, false],
    [480, 800, 8, false],
    [320, 600, 3, true],
  ] as const)(
    "%ix%i with %i tiles (indicators: %s) needs no scrolling",
    async (width, height, count, withIndicators) => {
      if (!browser) return;
      const r = await render(width, height, count, withIndicators);
      const label = `${width}x${height} n=${count}`;
      expect(r.scrolls, label).toBe(false);
      expect(r.lastBottom, label).toBeLessThanOrEqual(height + 0.5);
    },
  );

  it("scrolls rather than squashing tiles when the stage is too short", async () => {
    if (!browser) return;
    const r = await render(370, 240, 6, false);
    expect(r.scrolls).toBe(true);
  });
});

describe("SpotlightLandscapeLayout strip in Chromium", () => {
  async function render(
    width: number,
    count: number,
  ): Promise<{
    shown: number;
    allVisible: boolean;
    scrolls: boolean;
    tileWidth: number;
  }> {
    const a = planStrip(width, 0, count);
    const page = await browser!.newPage({ viewport: { width, height: 700 } });
    try {
      await page.setContent(`<!doctype html><style>${landscapeCss}html,body{margin:0}</style>
        <div class="layer" style="width:${width}px;height:700px;--strip-tile-width:${a.tileWidth}px;--strip-tile-height:${a.tileHeight}px">
          <div class="spotlight"></div>
          <div class="grid">${'<div class="slot"></div>'.repeat(a.people)}</div>
        </div>`);
      const m = await page.evaluate((w) => {
        const grid = document.querySelector(".grid")!;
        const tiles = [...document.querySelectorAll(".grid > .slot")].map((e) =>
          e.getBoundingClientRect(),
        );
        return {
          shown: tiles.length,
          allVisible: tiles.every((r) => r.left >= -0.5 && r.right <= w + 0.5),
          scrolls: grid.scrollWidth > grid.clientWidth + 1,
          tileWidth: tiles[0].width,
        };
      }, width);
      return m;
    } finally {
      await page.close();
    }
  }

  it.each([
    [1140, 2, 2],
    [1140, 6, 6],
    [1140, 8, 8],
    [1140, 9, 8],
    [1140, 30, 8],
    [900, 5, 5],
    [700, 12, 5],
    [420, 3, 3],
    [420, 7, 3],
  ] as const)(
    "%i px wide with %i participants shows %i, all fully visible",
    async (width, count, expected) => {
      if (!browser) return;
      const r = await render(width, count);
      const label = `${width} n=${count}`;
      expect(r.shown, label).toBe(expected);
      expect(r.allVisible, label).toBe(true);
      expect(r.scrolls, label).toBe(false);
      expect(r.tileWidth, label).toBe(planStrip(width, 0, count).tileWidth);
    },
  );
});

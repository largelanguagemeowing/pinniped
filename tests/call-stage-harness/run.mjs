// Usage: node tests/call-stage-harness/run.mjs [scenarios-json]   (prints a JSON report)
//        node tests/call-stage-harness/run.mjs --screenshots [dir]   (default: out/screenshots)
// Mounts the real CallStage around a fake call in real Chromium windows and checks the tile
// layout while resizing, including shrinking to tiny sizes. Ported from Element Call's layout
// harness with the same scenarios, sizes and report, so reports before and after a layout change
// can be compared.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(root, '..', '..');
const port = 5299;

const server = await createServer({
  root,
  configFile: false,
  plugins: [vanillaExtractPlugin(), react()],
  define: { __APP_COMMIT__: '"harness"', __APP_VERSION__: '"harness"' },
  legacy: { inconsistentCjsInterop: true },
  // The app's folds shim (lucide icons), as in vite.config.js.
  resolve: {
    alias: [{ find: /^folds$/, replacement: path.join(repo, 'src/folds/index.ts') }],
  },
  optimizeDeps: { entries: [path.join(root, 'index.html')] },
  server: { port, strictPort: true, fs: { allow: [repo] } },
  logLevel: 'error',
});
await server.listen();

const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });

/** The tiles the grids place: every child of a grid but its layout (the first). */
async function measure(page) {
  return page.evaluate(() => {
    const c = document.querySelector('[data-call-stage] > div');
    const tiles = [...(c?.children ?? [])]
      .flatMap((grid) => [...grid.children].slice(1))
      .map((e) => {
        const r = e.getBoundingClientRect();
        const kind = e.matches('[data-testid="videoTile"]') ? 'grid' : 'spotlight';
        return { kind, x: r.x, y: r.y, w: r.width, h: r.height };
      });
    const vis = tiles.filter((t) => t.w > 0 && t.h > 0);
    let overlaps = 0;
    for (let i = 0; i < vis.length; i++)
      for (let j = i + 1; j < vis.length; j++) {
        const a = vis[i];
        const b = vis[j];
        if (
          a.x < b.x + b.w - 1 &&
          b.x < a.x + a.w - 1 &&
          a.y < b.y + b.h - 1 &&
          b.y < a.y + a.h - 1
        )
          overlaps++;
      }
    return {
      view: [innerWidth, innerHeight],
      tiles: tiles.length,
      visible: vis.length,
      overlaps,
      scrolls: c ? c.scrollHeight > c.clientHeight + 1 : null,
      scrollbar: c ? c.offsetWidth - c.clientWidth : null,
      outside: vis.filter((t) => t.x < -1 || t.x + t.w > innerWidth + 1).length,
      sample: vis
        .slice(0, 3)
        .map(
          (t) =>
            `${t.kind}:${Math.round(t.w)}x${Math.round(t.h)}@${Math.round(t.x)},${Math.round(t.y)}`
        ),
    };
  });
}

async function open(scenario, viewport) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 300)));
  page.on('console', (m) => {
    if (m.type() === 'error' || /Maximum update depth/.test(m.text()))
      errors.push(m.text().slice(0, 400));
  });
  const qs = new URLSearchParams(Object.entries(scenario).map(([k, v]) => [k, String(v)]));
  await page.goto(`http://localhost:${port}/index.html?${qs}`);
  await page.waitForTimeout(600);
  return { page, errors };
}

async function layoutReport(scenarios) {
  // Dragging the window from large to tiny, then back out.
  const sizes = [
    [1280, 800],
    [900, 700],
    [600, 600],
    [420, 640],
    [370, 520],
    [300, 400],
    [200, 300],
    [120, 200],
    [80, 120],
    [40, 60],
    [1, 1],
    [0, 0],
    [160, 240],
    [370, 520],
    [900, 700],
  ];
  const report = [];
  for (const sc of scenarios) {
    const { page, errors } = await open(sc, { width: 1280, height: 800 });
    const steps = [];
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: Math.max(w, 1), height: Math.max(h, 1) });
      await page.waitForTimeout(300);
      steps.push(await measure(page));
    }
    report.push({ scenario: sc, errors: [...new Set(errors)].slice(0, 5), steps });
    await page.close();
  }
  return report;
}

async function screenshots(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const desktop = { width: 1280, height: 800 };
  const narrow = { width: 420, height: 760 };
  const shots = [
    ...[1, 2, 5, 9].flatMap((n) => [
      [`grid-${n}-desktop`, { layout: 'grid', tiles: n, rich: 1 }, desktop],
      [`grid-${n}-narrow`, { layout: 'grid', tiles: n, rich: 1 }, narrow],
    ]),
    [`grid-4-share-desktop`, { layout: 'grid', tiles: 4, shares: 1, rich: 1 }, desktop],
    [
      `spotlight-share-desktop`,
      { layout: 'spotlight-landscape', tiles: 5, shares: 1, rich: 1 },
      desktop,
    ],
    [
      `spotlight-share-narrow`,
      { layout: 'spotlight-portrait', tiles: 5, shares: 1, rich: 1 },
      narrow,
    ],
    [
      `spotlight-share-small-landscape`,
      { layout: 'spotlight-landscape', tiles: 9, shares: 2, rich: 1 },
      { width: 700, height: 480 },
    ],
    [`grid-5-idle-desktop`, { layout: 'grid', tiles: 5, rich: 1, idle: 1 }, desktop],
    [
      `grid-5-reconnecting-desktop`,
      { layout: 'grid', tiles: 5, rich: 1, reconnecting: 1 },
      desktop,
    ],
  ];
  const errors = {};
  // What the stage reported through onStreamHeightChange, per shot.
  const streamHeights = {};
  for (const [name, scenario, viewport] of shots) {
    const { page, errors: e } = await open(scenario, viewport);
    // Hover the first strip tile so the Hide Members pill shows in the spotlight shots.
    if (scenario.layout === 'spotlight-landscape')
      await page.hover('[data-pinniped-user-id]').catch(() => undefined);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(dir, `${name}.png`) });
    if (e.length) errors[name] = [...new Set(e)];
    streamHeights[name] = await page.evaluate(() => window.__streamHeights);
    await page.close();
  }
  return { dir, shots: shots.map(([name]) => name), errors, streamHeights };
}

const args = process.argv.slice(2);
let output;
if (args[0] === '--screenshots') {
  output = await screenshots(path.resolve(args[1] ?? path.join(root, 'out', 'screenshots')));
} else {
  output = await layoutReport(
    JSON.parse(args[0] ?? 'null') ?? [
      { layout: 'grid', tiles: 4, spotlight: 0 },
      { layout: 'grid', tiles: 9, spotlight: 0 },
      { layout: 'spotlight-portrait', tiles: 3 },
      { layout: 'spotlight-portrait', tiles: 6 },
      { layout: 'spotlight-portrait', tiles: 3, indicators: 1 },
      { layout: 'spotlight-landscape', tiles: 3 },
      { layout: 'one-on-one-landscape', tiles: 2 },
    ]
  );
}
await browser.close();
await server.close();
console.log(JSON.stringify(output, null, 1));

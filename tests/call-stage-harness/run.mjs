// Usage: node tests/call-stage-harness/run.mjs [scenarios-json]   (prints a JSON report)
//        node tests/call-stage-harness/run.mjs --screenshots [dir]   (default: out/screenshots)
//        node tests/call-stage-harness/run.mjs --drag [scenarios-json]  (drags the DM call divider)
//        node tests/call-stage-harness/run.mjs --call-only [scenarios-json] [dir]
//          (switches the DM call split to call-only, as in fullscreen, and back; screenshots in dir)
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
    if (m.type() === 'error' || /Maximum update depth|render storm/.test(m.text()))
      errors.push(m.text().slice(0, 1500));
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

/**
 * Mounts the stage in the DM call split and drags its divider up and down in small steps, as a
 * hand does, reporting errors and where the tiles ended up after each sweep.
 */
async function dragReport(scenarios) {
  const report = [];
  for (const { viewport, cpuSlowdown, ...sc } of scenarios) {
    const { page, errors } = await open(
      { ...sc, split: 1 },
      viewport ?? { width: 1280, height: 800 }
    );
    // A slower machine: frames take longer than the pointer moves that arrive meanwhile.
    if (cpuSlowdown)
      await (
        await page.context().newCDPSession(page)
      ).send('Emulation.setCPUThrottlingRate', {
        rate: cpuSlowdown,
      });
    const handle = page.getByRole('separator', { name: 'Resize call' });
    const box = await handle.boundingBox();
    const x = box.x + box.width / 2;
    const { height } = page.viewportSize();
    await page.mouse.move(x, box.y + box.height / 2);
    await page.mouse.down();
    const sweeps = [height - 20, 20, height / 2, height - 20, 150];
    const steps = [];
    // `fast`: the moves go out without waiting for each, as from a real mouse, so they can
    // arrive faster than the stage renders.
    const cdp = sc.fast ? await page.context().newCDPSession(page) : null;
    let y0 = box.y + box.height / 2;
    for (const y of sweeps) {
      if (cdp) {
        const moves = Array.from({ length: 120 }, (_, i) =>
          cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x,
            y: y0 + ((y - y0) * (i + 1)) / 120,
            button: 'left',
            buttons: 1,
          })
        );
        await Promise.all(moves);
      } else {
        await page.mouse.move(x, y, { steps: 60 });
      }
      y0 = y;
      await page.waitForTimeout(sc.settle ?? 150);
      steps.push({ to: Math.round(y), ...(await measure(page)) });
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
    report.push({
      scenario: sc,
      viewport,
      cpuSlowdown,
      errors: [...new Set(errors)].slice(0, 5),
      steps,
    });
    await page.close();
  }
  return report;
}

/**
 * Mounts the stage in the DM call split, switches it to call-only (the call fullscreened) and
 * back, and reports where the stage and chat are, and whether the stage survived (was not
 * remounted). Screenshots of both states go to `dir`.
 */
async function callOnlyReport(scenarios, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const report = [];
  for (const [i, { viewport, ...sc }] of scenarios.entries()) {
    const { page, errors } = await open(
      { ...sc, split: 1 },
      viewport ?? { width: 1280, height: 800 }
    );
    await page.evaluate(() => {
      document.querySelector('[data-call-stage]')?.setAttribute('data-harness-mark', '');
    });
    const state = () =>
      page.evaluate(() => {
        const rect = (e) => {
          const r = e?.getBoundingClientRect();
          return r && r.width > 0 && r.height > 0
            ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]
            : null;
        };
        return {
          stage: rect(document.querySelector('[data-call-stage]')),
          chat: rect(document.querySelector('[data-harness-chat]')),
          chatMounted: !!document.querySelector('[data-harness-chat]'),
          separator: !!document.querySelector('[role="separator"]'),
          stageKept: !!document.querySelector('[data-call-stage][data-harness-mark]'),
        };
      });
    const steps = [];
    for (const [name, callOnly] of [
      ['split', false],
      ['call-only', true],
      ['split-again', false],
    ]) {
      await page.evaluate((v) => window.__setCallOnly(v), callOnly);
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(dir, `${i}-${name}.png`) });
      steps.push({ name, ...(await state()), tiles: await measure(page) });
    }
    report.push({ scenario: sc, viewport, errors: [...new Set(errors)].slice(0, 5), steps });
    await page.close();
  }
  return report;
}

const args = process.argv.slice(2);
let output;
if (args[0] === '--drag') {
  output = await dragReport(
    JSON.parse(args[1] ?? 'null') ?? [
      { layout: 'auto', tiles: 4, shares: 1, rich: 1 },
      { layout: 'auto', tiles: 4, shares: 1, rich: 1, viewport: { width: 560, height: 900 } },
      { layout: 'auto', tiles: 4, shares: 0, rich: 1 },
      { layout: 'auto', tiles: 4, shares: 0, rich: 1, viewport: { width: 560, height: 900 } },
      { layout: 'auto', tiles: 9, shares: 2, rich: 1 },
    ]
  );
} else if (args[0] === '--call-only') {
  output = await callOnlyReport(
    JSON.parse(args[1] ?? 'null') ?? [
      { layout: 'auto', tiles: 4, shares: 1, rich: 1 },
      { layout: 'auto', tiles: 4, shares: 0, rich: 1, viewport: { width: 560, height: 900 } },
    ],
    path.resolve(args[2] ?? path.join(root, 'out', 'call-only'))
  );
} else if (args[0] === '--screenshots') {
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

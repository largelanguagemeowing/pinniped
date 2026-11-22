// Usage: node tests/call-stage-harness/run.mjs [scenarios-json]   (prints a JSON report)
//        node tests/call-stage-harness/run.mjs --screenshots [dir]   (default: out/screenshots)
//        node tests/call-stage-harness/run.mjs --drag [scenarios-json]  (drags the DM call divider)
//        node tests/call-stage-harness/run.mjs --strip-toggle   (when the Hide Members pill shows)
//        node tests/call-stage-harness/run.mjs --pip [dir]   (the floating call window: drag, fling, resize, persistence)
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
      `grid-5-undecryptable-desktop`,
      { layout: 'grid', tiles: 5, rich: 1, undecryptable: '1,2' },
      desktop,
    ],
    [
      `grid-9-undecryptable-narrow`,
      { layout: 'grid', tiles: 9, rich: 1, undecryptable: '1,5' },
      narrow,
    ],
    [
      `spotlight-undecryptable-desktop`,
      // The spotlight shows the first tile; the look is what is checked here.
      { layout: 'spotlight-landscape', tiles: 5, shares: 0, rich: 1, undecryptable: '0' },
      desktop,
    ],
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

/**
 * The floating call window over a stand-in app: where it rests, a slow drag, a fling, a resize,
 * what survives a reload, going back to the call on a double click, and when it stays away.
 */
async function pipReport(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const viewport = { width: 1280, height: 800 };
  const scenario = { pip: 1, tiles: 6, rich: 1 };
  const rect = (page) =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="callPip"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
  const shot = (page, name) => page.screenshot({ path: path.join(dir, `${name}.png`) });
  const steps = {};
  const { page, errors } = await open(scenario, viewport);
  await page.waitForTimeout(800);
  steps.initial = await rect(page);
  await shot(page, 'pip-initial');
  await page.mouse.move(steps.initial.x + 160, steps.initial.y + 90);
  await page.waitForTimeout(400);
  await shot(page, 'pip-hover');

  // A slow drag to the top-left, released after a pause: no fling.
  const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];
  let [cx, cy] = centre(steps.initial);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++)
    await page.mouse.move(cx - (i * (cx - 200)) / 20, cy - (i * (cy - 150)) / 20);
  await page.waitForTimeout(250);
  steps.duringDrag = await rect(page);
  await shot(page, 'pip-dragging');
  await page.mouse.up();
  // The snap into the corner settles with a light overshoot (about 7% of the way travelled,
  // not a wobble): sample the position as it settles.
  const settle = [];
  for (let i = 0; i < 25; i++) {
    settle.push(await rect(page));
    await page.waitForTimeout(30);
  }
  // The drag is released short of the corner at (80, 80), so overshoot is going past it.
  steps.snapOvershoot = {
    x: Math.max(0, Math.max(...settle.map((r) => r.x)) - 80),
    y: Math.max(0, Math.max(...settle.map((r) => r.y)) - 80),
  };
  await page.waitForTimeout(800);
  steps.afterSlowDrag = await rect(page);

  // A fling to the right along the top edge.
  [cx, cy] = centre(steps.afterSlowDrag);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(cx + i * 40, cy, { steps: 1 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  steps.afterFling = await rect(page);

  // Resize with the handle (at the corner away from the one it rests in).
  const r0 = steps.afterFling;
  const handle = await page.evaluate(() => {
    const h = document.querySelector('[data-testid="callPip"] [data-corner]');
    const r = h.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, corner: h.getAttribute('data-corner') };
  });
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(handle.x - i * 9, handle.y);
  await page.waitForTimeout(100);
  steps.duringResize = await rect(page);
  await page.mouse.up();
  await page.waitForTimeout(800);
  steps.afterResize = { ...(await rect(page)), handle: handle.corner, before: r0 };
  await shot(page, 'pip-resized');

  // What is remembered.
  steps.stored = await page.evaluate(() => ({
    corner: localStorage.getItem('pipCorner'),
    width: localStorage.getItem('pipWidth'),
  }));
  await page.reload();
  await page.waitForTimeout(1000);
  steps.afterReload = await rect(page);

  // Back to the call.
  const r1 = steps.afterReload;
  await page.mouse.dblclick(r1.x + r1.w / 2, r1.y + r1.h / 2);
  await page.waitForTimeout(300);
  steps.locationAfterDoubleClick = await page.evaluate(
    () => document.querySelector('[data-harness-location]').textContent
  );

  // Small viewport: the stored width shrinks to fit.
  await page.setViewportSize({ width: 600, height: 700 });
  await page.waitForTimeout(1200);
  steps.smallViewport = await rect(page);
  await shot(page, 'pip-small');
  await page.close();

  // Away while the call view is open, or when nobody has video.
  const withStage = await open({ ...scenario, stage: 1 }, viewport);
  steps.withCallView = await rect(withStage.page);
  errors.push(...withStage.errors);
  await withStage.page.close();
  const noVideo = await open({ pip: 1, tiles: 3 }, viewport);
  steps.nobodyHasVideo = await rect(noVideo.page);
  errors.push(...noVideo.errors);
  await noVideo.page.close();

  return { dir, errors: [...new Set(errors)].slice(0, 8), steps };
}

/**
 * The "Hide Members" pill: out of sight until a strip tile is hovered; once the strip is hidden
 * it stays while the user is active and fades when they are idle, and hovering it brings it back.
 */
async function stripToggleReport() {
  const report = {};
  for (const idle of [0, 1]) {
    const { page, errors } = await open(
      { layout: 'spotlight-landscape', tiles: 4, rich: 1, idle },
      { width: 1280, height: 800 }
    );
    const opacity = () =>
      page.evaluate(() =>
        Number(getComputedStyle(document.querySelector('button[aria-pressed]')).opacity)
      );
    const settle = () => page.waitForTimeout(350);
    await page.mouse.move(5, 5);
    await settle();
    const stripShown = { awayFromStrip: await opacity() };
    await page.hover('[data-pinniped-user-id]');
    await settle();
    stripShown.overStripTile = await opacity();
    await page.hover('button[aria-pressed]');
    await page.click('button[aria-pressed]');
    await page.mouse.move(5, 5);
    await settle();
    const stripHidden = { pointerAway: await opacity() };
    await page.hover('button[aria-pressed]');
    await settle();
    stripHidden.overPill = await opacity();
    report[idle ? 'idle' : 'active'] = { errors, stripShown, stripHidden };
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
} else if (args[0] === '--strip-toggle') {
  output = await stripToggleReport();
} else if (args[0] === '--pip') {
  output = await pipReport(path.resolve(args[1] ?? path.join(root, 'out', 'pip')));
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

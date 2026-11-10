// Usage: node layout-harness/run.mjs  (from element-call/)
// Mounts the real call layouts in real Chromium windows and checks them while
// resizing, including shrinking to tiny sizes. Prints a JSON report.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const server = await createServer({
  root,
  configFile: false,
  plugins: [react()],
  server: {
    port: 5199,
    strictPort: true,
    fs: { allow: [path.join(root, "..")] },
  },
  logLevel: "error",
});
await server.listen();

const browser = await chromium.launch({
  ignoreDefaultArgs: ["--hide-scrollbars"],
});

async function measure(page) {
  return page.evaluate(() => {
    const c = document.querySelector("[data-container]");
    const tiles = [...document.querySelectorAll("[data-tile]")].map((e) => {
      const r = e.getBoundingClientRect();
      return { kind: e.dataset.kind, x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const vis = tiles.filter((t) => t.w > 0 && t.h > 0);
    let overlaps = 0;
    for (let i = 0; i < vis.length; i++)
      for (let j = i + 1; j < vis.length; j++) {
        const a = vis[i],
          b = vis[j];
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
            `${t.kind}:${Math.round(t.w)}x${Math.round(t.h)}@${Math.round(t.x)},${Math.round(t.y)}`,
        ),
    };
  });
}

const scenarios = JSON.parse(process.argv[2] ?? "null") ?? [
  { layout: "grid", tiles: 4, spotlight: 0 },
  { layout: "grid", tiles: 9, spotlight: 0 },
  { layout: "spotlight-portrait", tiles: 3 },
  { layout: "spotlight-portrait", tiles: 6 },
  { layout: "spotlight-portrait", tiles: 3, indicators: 1 },
  { layout: "spotlight-landscape", tiles: 3 },
  { layout: "one-on-one-landscape", tiles: 2 },
];
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
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 300)));
  page.on("console", (m) => {
    if (m.type() === "error" || /Maximum update depth/.test(m.text()))
      errors.push(m.text().slice(0, 400));
  });
  const qs = new URLSearchParams(
    Object.entries(sc).map(([k, v]) => [k, String(v)]),
  ).toString();
  await page.goto(`http://localhost:5199/index.html?${qs}`);
  await page.waitForTimeout(400);
  const steps = [];
  for (const [w, h] of sizes) {
    await page.setViewportSize({
      width: Math.max(w, 1),
      height: Math.max(h, 1),
    });
    await page.waitForTimeout(300);
    steps.push(await measure(page));
  }
  report.push({
    scenario: sc,
    errors: [...new Set(errors)].slice(0, 5),
    steps,
  });
  await page.close();
}
await browser.close();
await server.close();
console.log(JSON.stringify(report, null, 1));

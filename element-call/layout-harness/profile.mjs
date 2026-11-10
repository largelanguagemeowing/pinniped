// Usage: node layout-harness/profile.mjs <element-call dir> [runs]
// Drags a real Chromium window through a resize on the real call layouts and
// reports browser time (script / layout / style), layout passes and React commits.
import path from "node:path";
const dir = path.resolve(process.argv[2]);
const runs = Number(process.argv[3] ?? 3);
const port = 5300 + Math.floor(Math.random() * 500);
const { createServer } = await import(path.join(dir, "node_modules/vite/dist/node/index.js"));
const react = (await import(path.join(dir, "node_modules/@vitejs/plugin-react/dist/index.js"))).default;
const { chromium } = await import(path.join(dir, "node_modules/@playwright/test/index.mjs"));
const root = path.join(dir, "layout-harness");
const server = await createServer({ root, configFile: false, plugins: [react()], server: { port, strictPort: true, fs: { allow: [dir] } }, logLevel: "silent" });
await server.listen();
const browser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });

const scenarios = [
  { name: "grid n=4", q: "layout=grid&tiles=4&spotlight=0" },
  { name: "grid n=12", q: "layout=grid&tiles=12&spotlight=0" },
  { name: "grid n=25", q: "layout=grid&tiles=25&spotlight=0" },
  { name: "grid n=60", q: "layout=grid&tiles=60&spotlight=0" },
  { name: "portrait n=6", q: "layout=spotlight-portrait&tiles=6" },
  { name: "portrait n=12", q: "layout=spotlight-portrait&tiles=12" },
  { name: "landscape n=6", q: "layout=spotlight-landscape&tiles=6" },
  { name: "landscape n=12", q: "layout=spotlight-landscape&tiles=12" },
];
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const STEPS = 40;
const path_ = [];
for (let i = 0; i <= STEPS; i++) path_.push([lerp(1280, 420, i / STEPS), lerp(800, 560, i / STEPS)]);
for (let i = STEPS; i >= 0; i--) path_.push([lerp(1280, 420, i / STEPS), lerp(800, 560, i / STEPS)]);

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const out = [];
for (const sc of scenarios) {
  const samples = [];
  for (let r = 0; r < runs; r++) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message)));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await page.goto(`http://localhost:${port}/index.html?${sc.q}`);
    await page.waitForTimeout(700);
    const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
    await page.evaluate(() => { window.__prof.commits = 0; window.__prof.actual = 0; });
    const m0 = await metrics();
    for (const [w, h] of path_) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(8); }
    await page.waitForTimeout(400);
    const m1 = await metrics();
    const prof = await page.evaluate(() => ({ ...window.__prof }));
    const d = (k) => (m1[k] - m0[k]);
    samples.push({
      scriptMs: d("ScriptDuration") * 1000, layoutMs: d("LayoutDuration") * 1000, styleMs: d("RecalcStyleDuration") * 1000,
      taskMs: d("TaskDuration") * 1000, layouts: d("LayoutCount"), styles: d("RecalcStyleCount"),
      commits: prof.commits, reactMs: prof.actual, heapKB: d("JSHeapUsedSize") / 1024, nodes: m1.Nodes, errors: errors.length,
    });
    await page.close();
  }
  const pick = (k) => median(samples.map((s) => s[k]));
  out.push({ name: sc.name, steps: path_.length, ...Object.fromEntries(["scriptMs", "layoutMs", "styleMs", "taskMs", "layouts", "styles", "commits", "reactMs", "heapKB", "nodes", "errors"].map((k) => [k, pick(k)])) });
}
await browser.close(); await server.close();
console.log(JSON.stringify(out));

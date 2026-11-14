// The page the window shows when the app itself fails to load (dev server not running, dist
// missing), instead of a blank grey window. Self-contained: it is loaded as a data: URL, so it
// works when nothing else does. Retrying navigates back to the app URL, which the window's
// navigation guard allows because that URL is internal.

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Chromium net error codes worth a plain-language hint.
const HINTS = {
  '-102': 'Nothing is listening at that address (connection refused).',
  '-105': 'The host name could not be resolved.',
  '-106': 'There is no network connection.',
  '-118': 'The connection timed out.',
  '-324': 'The server closed the connection without answering.',
  '-6': 'The file was not found.',
};

/**
 * @param {{ url: string, code: number, description: string, dev: boolean, distDir: string,
 *   distPresent: boolean, version?: string }} info
 */
function buildLoadErrorPage(info) {
  const { url, code, description, dev, distDir, distPresent, version } = info;
  const hint = HINTS[String(code)];

  const steps = dev
    ? [
        'Start the dev server in another terminal: <code>npx vite --strictPort</code>',
        'It must use the port in the address above (set <code>PINNIPED_DEV_PORT</code> to change it).',
        'This window retries by itself every few seconds, so it loads once the server is up.',
      ]
    : distPresent
      ? [
          `The bundle in <code>${escapeHtml(distDir)}</code> exists, but the window could not load it.`,
          'Reinstall the app, or rebuild with <code>npm run build</code> if you run from source.',
        ]
      : [
          `There is no web bundle at <code>${escapeHtml(distDir)}</code>.`,
          'Run <code>npm run build</code> (from source), or reinstall the app.',
        ];

  const details = [
    `Address: ${url}`,
    `Error: ${description || 'unknown'} (${code})`,
    `Mode: ${dev ? 'dev server' : 'packaged bundle'}`,
    `Bundle: ${distDir} (${distPresent ? 'found' : 'missing'})`,
    version ? `Version: ${version}` : '',
    `Electron ${process.versions.electron || '?'}, Chromium ${process.versions.chrome || '?'}, ${process.platform} ${process.arch}`,
  ]
    .filter(Boolean)
    .join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Pinniped</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #15171e; color: #e6e7ec; font: 14px/1.5 system-ui, sans-serif; }
  main { width: min(560px, 90vw); }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p { margin: 6px 0; }
  .muted { opacity: .7; }
  ul { padding-left: 20px; }
  code, pre { font: 12.5px ui-monospace, Consolas, monospace; background: #1d2029; border-radius: 4px; }
  code { padding: 1px 5px; }
  pre { padding: 10px 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; user-select: text; }
  .row { display: flex; gap: 8px; align-items: center; margin-top: 16px; }
  button { border: 0; border-radius: 6px; padding: 7px 16px; cursor: pointer; font: inherit; color: inherit; background: #2d3142; }
  button.primary { background: #5b6fd6; color: #fff; }
  #status { margin-left: auto; font-size: 12px; opacity: .6; }
</style></head>
<body><main>
<h1>Pinniped can't load</h1>
<p class="muted">${escapeHtml(description || 'The window failed to load.')}${hint ? ` ${escapeHtml(hint)}` : ''}</p>
<p>Tried: <code>${escapeHtml(url)}</code></p>
<ul>${steps.map((s) => `<li>${s}</li>`).join('')}</ul>
<div class="row">
  <button class="primary" id="retry">Retry now</button>
  <button id="copy">Copy details</button>
  <span id="status"></span>
</div>
<details style="margin-top:14px"><summary class="muted">Details</summary><pre id="details">${escapeHtml(details)}</pre></details>
<script>
  const target = ${JSON.stringify(url)};
  const status = document.getElementById('status');
  const retry = () => location.replace(target);
  document.getElementById('retry').onclick = retry;
  document.getElementById('copy').onclick = () => {
    navigator.clipboard.writeText(document.getElementById('details').textContent)
      .then(() => { status.textContent = 'Copied'; }, () => { status.textContent = 'Copy failed'; });
  };
  ${
    dev
      ? `let left = 3;
  const tick = () => {
    status.textContent = 'Retrying in ' + left + 's';
    if (left-- <= 0) retry();
  };
  tick();
  setInterval(tick, 1000);`
      : ''
  }
</script>
</main></body></html>`;
}

module.exports = { buildLoadErrorPage };

// Builds the Element Call fork vendored in element-call/ (repo root).
// The vendored tree is upstream tag v0.20.1 with the former patch series
// (voice-call-layout, sound-overrides) already applied; edit it in place.
// Usage: node scripts/fork/element-call/build.mjs [outDir]
// Output defaults to node_modules/.cache/cinny-element-call-fork.
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
export const ELEMENT_CALL_SRC = path.join(repoRoot, 'element-call');
export const ELEMENT_CALL_TAG = 'v0.20.1';

// CI=true keeps pnpm from prompting (and aborting) when there is no TTY, as under vite.
// NODE_OPTIONS gives the widget build the memory it needs (it used to be a prefix on
// the build:full script, which cmd.exe cannot parse).
// On Windows pnpm is a pnpm.cmd shim, which execFileSync cannot start (ENOENT), so
// the command goes through the shell there. The arguments are fixed, space-free strings.
const run = (cmd, args, cwd) => {
  const options = {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true', NODE_OPTIONS: '--max-old-space-size=16384' },
  };
  if (process.platform === 'win32') {
    execSync([cmd, ...args].join(' '), options);
  } else {
    execFileSync(cmd, args, options);
  }
};

const mtime = (file) => (fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0);

function newestMtime(target) {
  if (!fs.existsSync(target)) return 0;
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return fs
    .readdirSync(target)
    .reduce((newest, name) => Math.max(newest, newestMtime(path.join(target, name))), stat.mtimeMs);
}

// Everything that ends up in the widget bundle; element-call/dist and node_modules do not.
const SOURCE_INPUTS = ['src', 'locales', 'public', 'index.html', 'package.json', 'pnpm-lock.yaml'];
const sourcesNewestMtime = () =>
  Math.max(...SOURCE_INPUTS.map((name) => newestMtime(path.join(ELEMENT_CALL_SRC, name))));

/** Whether the vendored source exists and is newer than the build at outDir. */
export function elementCallForkStale(outDir) {
  if (!fs.existsSync(path.join(ELEMENT_CALL_SRC, 'package.json'))) return false;
  return sourcesNewestMtime() > mtime(path.join(outDir, 'index.html'));
}

export function buildElementCallFork(outDir) {
  if (!fs.existsSync(path.join(ELEMENT_CALL_SRC, 'package.json'))) {
    throw new Error(`Element Call source not found at ${ELEMENT_CALL_SRC}`);
  }
  const installed = mtime(path.join(ELEMENT_CALL_SRC, 'node_modules/.modules.yaml'));
  if (installed < mtime(path.join(ELEMENT_CALL_SRC, 'pnpm-lock.yaml'))) {
    run('pnpm', ['install', '--frozen-lockfile'], ELEMENT_CALL_SRC);
  }
  run('pnpm', ['build:embedded'], ELEMENT_CALL_SRC);

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(path.join(ELEMENT_CALL_SRC, 'dist'), outDir, { recursive: true });
  // The embedded vite build disables publicDir, so the self-hosted
  // DeepFilterNet runtime assets (fetched by the widget at runtime) are
  // copied here explicitly.
  fs.cpSync(path.join(ELEMENT_CALL_SRC, 'public/df3'), path.join(outDir, 'df3'), {
    recursive: true,
  });
  return outDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv[2] ?? 'node_modules/.cache/cinny-element-call-fork');
  buildElementCallFork(out);
  console.log(`Element Call fork built at ${out}`);
}

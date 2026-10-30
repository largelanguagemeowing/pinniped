import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { wasm } from '@rollup/plugin-wasm';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import buildConfig from './build.config.ts';
import { prepareElementCall } from './scripts/fork/element-call/prepare.mjs';
import { buildElementCallFork, ELEMENT_CALL_SRC } from './scripts/fork/element-call/build.mjs';

// Fork-only: short commit hash baked into the bundle. The container build has
// no .git, so the Dockerfile passes it in as APP_COMMIT.
const appCommit = (() => {
  if (process.env.APP_COMMIT) return process.env.APP_COMMIT;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
})();

const elementCallPath = prepareElementCall();

// vite-plugin-static-copy 2+ keeps the source directory structure in the output, so
// `stripBase` drops the leading source directories to land files where the app (and
// public/manifest.json) expect them.
const elementCallRelative = path.relative(process.cwd(), elementCallPath).split(path.sep);

const copyFiles = {
  targets: [
    {
      src: `${elementCallRelative.join('/')}/**/*`,
      dest: 'public/element-call',
      rename: { stripBase: elementCallRelative.filter((part) => part !== '..').length },
    },
    {
      src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
      dest: '',
      rename: { stripBase: true, name: 'pdf.worker.min.js' },
    },
    {
      src: 'config.json',
      dest: '',
    },
    {
      src: 'public/manifest.json',
      dest: '',
      rename: { stripBase: 1 },
    },
    {
      src: 'public/res/android',
      dest: 'public/',
      rename: { stripBase: 2 },
    },
    {
      src: 'public/locales',
      dest: 'public/',
      rename: { stripBase: 1 },
    },
  ],
};

function serverMatrixSdkCryptoWasm(wasmFilePath) {
  return {
    name: 'vite-plugin-serve-matrix-sdk-crypto-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === wasmFilePath) {
          const resolvedPath = path.join(
            path.resolve(),
            '/node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm'
          );

          if (fs.existsSync(resolvedPath)) {
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Cache-Control', 'no-cache');

            const fileStream = fs.createReadStream(resolvedPath);
            fileStream.pipe(res);
          } else {
            res.writeHead(404);
            res.end('File not found');
          }
        } else {
          next();
        }
      });
    },
  };
}

const MIME_TYPES = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mjs': 'text/javascript',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// viteStaticCopy only runs at build time, so dist serves config.json, public/ and
// the Element Call bundle — but the dev server serves none of them and the app
// fetches those paths at runtime. Serve them in dev from where they live.
function serveRuntimeCopies(widgetDir) {
  const sources = [
    ['/config.json', path.resolve('config.json')],
    ['/public/element-call/', widgetDir],
    ['/public/', path.resolve('public')],
  ];
  return {
    name: 'vite-plugin-serve-runtime-copies',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Vite answers asset imports itself (e.g. `foo.svg?import` becomes a JS
        // module); only plain runtime fetches (no query) are ours to serve.
        const url = req.url ?? '';
        if (url.includes('?')) return next();
        if (url.includes('..')) return next();
        const [prefix, source] = sources.find(([p]) => url === p || url.startsWith(p)) ?? [];
        if (prefix === undefined) return next();
        const file = prefix.endsWith('/') ? path.join(source, url.slice(prefix.length)) : source;
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
        res.setHeader('Content-Type', MIME_TYPES[path.extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

// Dev only: rebuild the vendored Element Call widget when its source changes and
// reload the page, so editing element-call/ behaves like editing src/.
function rebuildElementCallOnChange(outDir) {
  return {
    name: 'vite-plugin-rebuild-element-call',
    apply: 'serve',
    configureServer(server) {
      if (process.env.ELEMENT_CALL_FORK_REBUILD === '0' || !fs.existsSync(ELEMENT_CALL_SRC)) return;
      const watched = ['src', 'locales', 'public', 'index.html'].map((n) =>
        path.join(ELEMENT_CALL_SRC, n)
      );
      server.watcher.add(watched);
      let timer;
      let building = false;
      let again = false;
      const rebuild = () => {
        if (building) {
          again = true;
          return;
        }
        building = true;
        try {
          buildElementCallFork(outDir);
          server.ws.send({ type: 'full-reload' });
        } catch (e) {
          server.config.logger.error(`Element Call rebuild failed: ${e.message}`);
        }
        building = false;
        if (again) {
          again = false;
          rebuild();
        }
      };
      server.watcher.on('all', (_event, file) => {
        if (!watched.some((w) => file === w || file.startsWith(w + path.sep))) return;
        clearTimeout(timer);
        timer = setTimeout(rebuild, 300);
      });
    },
  };
}

export default defineConfig({
  appType: 'spa',
  publicDir: false,
  define: {
    __APP_COMMIT__: JSON.stringify(appCommit),
  },
  base: buildConfig.base,
  // Vite 8 follows Node's CJS interop in this "type": "module" package: a default import
  // of a CommonJS dependency is its whole exports object, not exports.default (millify
  // broke that way). Keep the pre-8 behaviour for every dependency.
  legacy: {
    inconsistentCjsInterop: true,
  },
  resolve: {
    // Fork-only: bare `folds` resolves to our shim (src/folds/index.ts) which
    // re-exports folds but overrides the `Icons` enum with lucide-react icons.
    // The regex matches only the exact specifier; 'folds/dist/*' subpaths
    // (CSS, types) still resolve to the real package.
    alias: [
      {
        find: /^folds$/,
        replacement: fileURLToPath(new URL('./src/folds/index.ts', import.meta.url)),
      },
    ],
  },
  server: {
    // Overridable because 8080 is a common port for other local servers.
    port: Number(process.env.PINNIPED_DEV_PORT) || 5173,
    host: true,
    watch: {
      // The widget build output is reloaded explicitly by rebuildElementCallOnChange.
      ignored: ['**/element-call/dist/**', '**/.pnpm-store/**'],
    },
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..'],
    },
  },
  plugins: [
    serverMatrixSdkCryptoWasm('/node_modules/.vite/deps/pkg/matrix_sdk_crypto_wasm_bg.wasm'),
    serveRuntimeCopies(elementCallPath),
    rebuildElementCallOnChange(elementCallPath),
    viteStaticCopy(copyFiles),
    vanillaExtractPlugin(),
    wasm(),
    react(),
    VitePWA({
      srcDir: 'src',
      filename: 'sw.ts',
      strategies: 'injectManifest',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        injectionPoint: undefined,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  optimizeDeps: {
    rolldownOptions: {
      transform: {
        define: {
          global: 'globalThis',
        },
        inject: { Buffer: ['buffer', 'Buffer'] },
      },
    },
  },
  build: {
    outDir: 'dist',
    // Fork-only: prod maps only on demand (SOURCEMAP=1); they cost ~3.5 s per build.
    sourcemap: process.env.SOURCEMAP === '1',
    copyPublicDir: false,
    rolldownOptions: {
      transform: {
        inject: { Buffer: ['buffer', 'Buffer'] },
      },
    },
  },
});

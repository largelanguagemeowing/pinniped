// Serves the built Pinniped SPA over a custom privileged scheme (app://cinny/).
// A standard+secure scheme gives a stable origin (session persists), a secure
// context (service worker works), and no open TCP port. SPA fallback mirrors
// docker-nginx.conf.

const { protocol } = require('electron');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const SCHEME = 'app';
const HOST = 'cinny';
const APP_ORIGIN = `${SCHEME}://${HOST}`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
};

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function statOrNull(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

// must run before app 'ready'
function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        allowServiceWorkers: true,
      },
    },
  ]);
}

// must run after app 'ready'; returns the origin URL to load
function registerAppHandler(root) {
  const indexPath = path.join(root, 'index.html');

  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    // One origin only: any other host would be the same app under a separate, empty profile.
    if (url.host !== HOST) return new Response('Not found', { status: 404 });
    let filePath = path.normalize(path.join(root, decodeURIComponent(url.pathname)));

    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }

    let stat = statOrNull(filePath);
    if (stat && stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = statOrNull(filePath);
    }

    // SPA fallback: unknown route -> index.html
    if (!stat || !stat.isFile()) {
      filePath = indexPath;
    }

    const body = Readable.toWeb(fs.createReadStream(filePath));
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': contentType(filePath) },
    });
  });

  return `${APP_ORIGIN}/`;
}

module.exports = { registerAppScheme, registerAppHandler, APP_ORIGIN };

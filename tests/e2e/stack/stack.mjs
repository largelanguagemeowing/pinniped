// Usage: node tests/e2e/stack/stack.mjs up|down|logs
//
// A throwaway Matrix stack for the e2e suite, on this machine's loopback: Synapse, LiveKit and
// lk-jwt-service (an application service, as matrix-installer runs it), plus justserve serving
// dist/ with the production settings. `up` does not build the app: run `npm run build` first. It registers
// four accounts and writes their credentials to playwright/.stack/e2e.env, which
// `npm run test:e2e:stack` reads. Secrets and the TLS certificate are generated per `up`.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..', '..', '..');
const state = path.join(repo, 'playwright', '.stack');
const conf = path.join(state, 'conf');
const envFile = path.join(state, 'e2e.env');

const IMAGES = {
  synapse: 'ghcr.io/element-hq/synapse:v1.165.0',
  livekit: 'docker.io/livekit/livekit-server:v1.13.11',
  jwt: 'ghcr.io/element-hq/lk-jwt-service:0.10.0',
  // built from the Containerfile's server stage: justserve with the production settings
  web: 'localhost/pinniped-e2e-web',
};

// Off the usual defaults, so the stack runs next to a dev server or a local homeserver.
const PORTS = {
  homeserver: 18448,
  jwt: 18080,
  livekit: 17880,
  livekitTcp: 17881,
  livekitUdp: 17882,
  web: 14173,
};

const SERVER_NAME = `localhost:${PORTS.homeserver}`;
const HOMESERVER_URL = `https://${SERVER_NAME}`;
// env prefix (see tests/e2e/support/env.ts) -> username
const ACCOUNTS = {
  E2E: 'e2e-user',
  E2E_PEER: 'e2e-peer',
  E2E_THIRD: 'e2e-third',
  E2E_FOURTH: 'e2e-fourth',
};
const LABEL = 'club.stablecat.pinniped.e2e-stack';

const runtime = process.env.E2E_CONTAINER_RUNTIME ?? (hasCommand('podman') ? 'podman' : 'docker');

function hasCommand(name) {
  return spawnSync(name, ['--version'], { stdio: 'ignore' }).status === 0;
}

function container(...args) {
  return execFileSync(runtime, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

const token = () => randomBytes(32).toString('base64url');

/** `${name}` substitution; an unknown name throws rather than leaving a broken config. */
function render(template, values) {
  const text = fs.readFileSync(path.join(here, template), 'utf8');
  const out = text.replace(/\$\{(\w+)\}/g, (_, name) => {
    if (!(name in values)) throw new Error(`${template}: no value for \${${name}}`);
    return String(values[name]);
  });
  fs.writeFileSync(path.join(conf, template), out);
}

function writeCertificate() {
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:prime256v1',
      '-nodes',
      '-days',
      '7',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
      '-keyout',
      path.join(conf, 'tls.key'),
      '-out',
      path.join(conf, 'tls.crt'),
    ],
    { stdio: 'ignore' }
  );
  // Synapse runs as an unprivileged user in its container.
  fs.chmodSync(path.join(conf, 'tls.key'), 0o644);
}

/** HTTPS against the homeserver, trusting only the stack's own certificate. */
function homeserverRequest(method, urlPath, body) {
  const ca = fs.readFileSync(path.join(conf, 'tls.crt'));
  return new Promise((resolve, reject) => {
    const req = https.request(
      `${HOMESERVER_URL}${urlPath}`,
      { method, ca, headers: body ? { 'Content-Type': 'application/json' } : {} },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

async function waitFor(name, probe, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'no response';
  while (Date.now() < deadline) {
    try {
      if (await probe()) return;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => {
      setTimeout(r, 1000);
    });
  }
  logs();
  throw new Error(`${name} did not come up (${last})`);
}

const httpOk = (url) => async () => (await fetch(url)).ok;

/** Shared-secret registration, the way matrix-installer provisions accounts. */
async function register(secret, username, password) {
  const nonce = JSON.parse(
    (await homeserverRequest('GET', '/_synapse/admin/v1/register')).body
  ).nonce;
  const mac = createHmac('sha1', secret)
    .update([nonce, username, password, 'notadmin'].join('\0'))
    .digest('hex');
  const res = await homeserverRequest('POST', '/_synapse/admin/v1/register', {
    nonce,
    username,
    password,
    admin: false,
    mac,
  });
  if (res.status !== 200) throw new Error(`registering ${username}: ${res.status} ${res.body}`);
}

function stackContainers() {
  return container('ps', '-a', '-q', '--filter', `label=${LABEL}`).split('\n').filter(Boolean);
}

function down() {
  const ids = stackContainers();
  if (ids.length > 0) container('rm', '-f', '-v', ...ids);
  fs.rmSync(state, { recursive: true, force: true });
}

function logs() {
  for (const name of ['synapse', 'livekit', 'jwt', 'web']) {
    process.stderr.write(`\n===== ${name} =====\n`);
    spawnSync(runtime, ['logs', `pinniped-e2e-${name}`], { stdio: 'inherit' });
  }
}

function run(name, image, options, args = []) {
  container(
    'run',
    '-d',
    '--stop-timeout',
    '1',
    '--name',
    `pinniped-e2e-${name}`,
    '--label',
    LABEL,
    ...options,
    image,
    ...args
  );
}

const mount = (file, target) => ['-v', `${path.join(conf, file)}:${target}:ro,z`];

async function up() {
  const dist = path.join(repo, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    throw new Error('dist/ has no build; run `npm run build` first');
  }
  down();
  fs.mkdirSync(conf, { recursive: true });

  const secrets = {
    registration_secret: token(),
    macaroon_secret: token(),
    form_secret: token(),
    livekit_key: `API${randomBytes(6).toString('hex')}`,
    livekit_secret: token(),
    as_token: token(),
    hs_token: token(),
  };
  const values = {
    ...secrets,
    server_name: SERVER_NAME,
    homeserver_port: PORTS.homeserver,
    jwt_port: PORTS.jwt,
    livekit_port: PORTS.livekit,
    livekit_tcp_port: PORTS.livekitTcp,
    livekit_udp_port: PORTS.livekitUdp,
  };
  for (const template of [
    'homeserver.yaml',
    'livekit.yaml',
    'lk-jwt-registration.yaml',
    'pinniped-config.json',
  ]) {
    render(template, values);
  }
  writeCertificate();

  // Host networking: the browser, the SFU and the services all meet on loopback, as WebRTC
  // needs no NAT traversal there.
  run('synapse', IMAGES.synapse, [
    '--network',
    'host',
    '-e',
    'SYNAPSE_CONFIG_PATH=/config/homeserver.yaml',
    // database, media and signing key: nothing outlives the run
    '--tmpfs',
    '/data:mode=1777',
    ...mount('homeserver.yaml', '/config/homeserver.yaml'),
    ...mount('lk-jwt-registration.yaml', '/config/lk-jwt-registration.yaml'),
    ...mount('tls.crt', '/config/tls.crt'),
    ...mount('tls.key', '/config/tls.key'),
  ]);
  run(
    'livekit',
    IMAGES.livekit,
    ['--network', 'host', ...mount('livekit.yaml', '/etc/livekit.yaml')],
    ['--config', '/etc/livekit.yaml']
  );
  run('jwt', IMAGES.jwt, [
    '--network',
    'host',
    '-e',
    `LIVEKIT_URL=ws://127.0.0.1:${PORTS.livekit}`,
    '-e',
    `LIVEKIT_KEY=${secrets.livekit_key}`,
    '-e',
    `LIVEKIT_SECRET=${secrets.livekit_secret}`,
    '-e',
    `LIVEKIT_JWT_BIND=127.0.0.1:${PORTS.jwt}`,
    '-e',
    `LIVEKIT_FULL_ACCESS_HOMESERVERS=${SERVER_NAME}`,
    '-e',
    'LIVEKIT_AS_REGISTRATION_FILE=/etc/lk-jwt/registration.yaml',
    '-e',
    `LIVEKIT_HS_SERVER_NAME=${SERVER_NAME}`,
    '-e',
    `LIVEKIT_CS_API_URL_OVERRIDES=${SERVER_NAME}=${HOMESERVER_URL}`,
    // The homeserver's certificate is the stack's own, self-signed.
    '-e',
    'LIVEKIT_INSECURE_SKIP_VERIFY_TLS=YES_I_KNOW_WHAT_I_AM_DOING',
    '-e',
    'LIVEKIT_SANITY_CHECK_INTERVAL_SECONDS=60',
    ...mount('lk-jwt-registration.yaml', '/etc/lk-jwt/registration.yaml'),
  ]);
  // The server stage copies nothing from its context and skips the bundle build; dist/ is
  // mounted where the production image has its copy.
  const webContext = path.join(state, 'web-context');
  fs.mkdirSync(webContext);
  container(
    'build',
    '-q',
    '--target',
    'server',
    '-t',
    IMAGES.web,
    '-f',
    path.join(repo, 'Containerfile'),
    webContext
  );
  run('web', IMAGES.web, [
    '-p',
    `127.0.0.1:${PORTS.web}:8080`,
    '-v',
    `${dist}:/srv:ro,z`,
    ...mount('pinniped-config.json', '/srv/config.json'),
  ]);

  await waitFor('Synapse', async () => {
    const res = await homeserverRequest('GET', '/health');
    return res.status === 200;
  });
  await waitFor('lk-jwt-service', httpOk(`http://127.0.0.1:${PORTS.jwt}/healthz`));
  await waitFor('LiveKit', httpOk(`http://127.0.0.1:${PORTS.livekit}/`));
  await waitFor('web', httpOk(`http://127.0.0.1:${PORTS.web}/config.json`));

  const accounts = [];
  for (const [prefix, username] of Object.entries(ACCOUNTS)) {
    const password = token();
    await register(secrets.registration_secret, username, password);
    accounts.push(`${prefix}_USERNAME=${username}`, `${prefix}_PASSWORD=${password}`);
  }

  fs.writeFileSync(
    envFile,
    [
      `PLAYWRIGHT_BASE_URL=http://localhost:${PORTS.web}`,
      `E2E_HOMESERVER=${SERVER_NAME}`,
      ...accounts,
      // the homeserver's certificate is self-signed
      'E2E_IGNORE_HTTPS_ERRORS=true',
      '',
    ].join('\n'),
    { mode: 0o600 }
  );
  process.stdout.write(`e2e stack up: ${HOMESERVER_URL}, app on http://localhost:${PORTS.web}\n`);
}

const command = process.argv[2];
if (command === 'up') await up();
else if (command === 'down') down();
else if (command === 'logs') logs();
else {
  process.stderr.write('usage: node tests/e2e/stack/stack.mjs up|down|logs\n');
  process.exit(2);
}

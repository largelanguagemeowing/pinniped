// Builds the Windows installer: electron-builder packages the unpacked app (`--win dir`), then
// the Rust installer (electron/installer) wraps it into Pinniped-Setup-<version>-x64.exe and we
// write latest.yml, which the installed app's updater (electron-updater) reads from the
// GitHub release. electron-builder's own NSIS target is not used: its installer stub is built
// without relocation info and crashes under Windows' Mandatory ASLR (see AGENTS.md).
//
// Usage: node scripts/fork/electron/build-windows-installer.mjs [--skip-builder] [--preset 0-9]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
  console.error('The Windows installer can only be built on Windows.');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const outDir = join(root, 'electron', 'out');
const unpacked = join(outDir, 'win-unpacked');
const installerDir = join(root, 'electron', 'installer');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const args = process.argv.slice(2);
const skipBuilder = args.includes('--skip-builder');
const presetAt = args.indexOf('--preset');
const preset = presetAt >= 0 ? args[presetAt + 1] : '9';

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', shell: false, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    console.error(`${cmd} ${cmdArgs.join(' ')} failed (${r.status})`);
    process.exit(r.status ?? 1);
  }
}

// 1. The unpacked app.
if (!skipBuilder) {
  rmSync(unpacked, { recursive: true, force: true });
  run(
    process.execPath,
    [
      join(root, 'node_modules', 'electron-builder', 'cli.js'),
      '--config',
      'electron/electron-builder.yml',
      '--win',
      'dir',
      '--publish',
      'never',
    ],
    { env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } }
  );
}
if (!existsSync(join(unpacked, 'Pinniped.exe'))) {
  console.error(`${unpacked} has no Pinniped.exe; run without --skip-builder first.`);
  process.exit(1);
}

// 2. What electron-updater reads at runtime. electron-builder only writes this for its NSIS
// target, so write it here; keep it in line with `publish` in electron-builder.yml.
writeFileSync(
  join(unpacked, 'resources', 'app-update.yml'),
  [
    'provider: github',
    'owner: largelanguagemeowing',
    'repo: pinniped',
    'updaterCacheDirName: pinniped-updater',
    '',
  ].join('\n')
);

// 3. The installer stub and the packer.
// From inside the crate: cargo reads .cargo/config.toml (static C runtime) from the working
// directory, not from --manifest-path.
run('cargo', ['build', '--release'], { cwd: installerDir });
const target = join(installerDir, 'target', 'release');
const artifact = `Pinniped-Setup-${version}-x64.exe`;
const out = join(outDir, artifact);
rmSync(out, { force: true });
run(join(target, 'pinniped-pack.exe'), [
  '--stub',
  join(target, 'pinniped-setup.exe'),
  '--dir',
  unpacked,
  '--version',
  version,
  '--out',
  out,
  '--preset',
  preset,
]);

// 4. latest.yml, in the format electron-updater expects.
const hash = createHash('sha512');
await new Promise((res, rej) => {
  createReadStream(out)
    .on('data', (c) => hash.update(c))
    .on('end', res)
    .on('error', rej);
});
const sha512 = hash.digest('base64');
const size = statSync(out).size;
writeFileSync(
  join(outDir, 'latest.yml'),
  [
    `version: ${version}`,
    'files:',
    `  - url: ${artifact}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${artifact}`,
    `sha512: ${sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    '',
  ].join('\n')
);
console.log(`\n${artifact}  ${(size / 1e6).toFixed(1)} MB\nlatest.yml written to ${outDir}`);

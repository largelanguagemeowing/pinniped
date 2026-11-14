// electron-builder `beforePack` hook: the packaged app ships no node_modules, so bundle
// electron-updater (and its dependencies) into the single file electron/updater.cjs requires.
const path = require('path');

module.exports = async function beforePack() {
  const { build } = require('esbuild');
  const root = path.resolve(__dirname, '..', '..', '..');
  await build({
    entryPoints: [path.join(root, 'electron', 'updater-entry.cjs')],
    outfile: path.join(root, 'electron', 'updater.bundle.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    logLevel: 'warning',
  });
};

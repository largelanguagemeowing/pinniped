// Silent self-update for the installed Windows build, in the style of Discord: check on
// launch and every few hours, download in the background, and install when the app quits
// (or on "Restart to update" in the tray). No prompts, no UAC (the NSIS install is per-user).
// Updates come from the GitHub release's latest.yml (see `publish` in electron-builder.yml).
//
// electron-updater is bundled into electron/updater.bundle.cjs by scripts/fork/electron/
// before-pack.cjs, because the packaged app ships no node_modules.
const { app } = require('electron');
const { createUpdateStatus } = require('./update-status.cjs');

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// Only the installed Windows build updates itself; Linux packages and Nix are managed by
// their package manager, and a dev run has nothing to replace.
const supported = process.platform === 'win32' && app.isPackaged;

const EVENTS = [
  'checking-for-update',
  'update-available',
  'update-not-available',
  'download-progress',
  'update-downloaded',
  'error',
];

/**
 * @param {{
 *   log: (msg: string) => void,
 *   onReady: (version: string) => void,
 *   onStatus: (status: object) => void,
 * }} hooks
 */
function startUpdater({ log, onReady, onStatus }) {
  if (!supported) return null;
  let autoUpdater;
  try {
    ({ autoUpdater } = require('./updater.bundle.cjs'));
  } catch (err) {
    log(`Updater unavailable: ${err}`);
    return null;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (m) => log(`updater: ${m}`),
    warn: (m) => log(`updater: ${m}`),
    error: (m) => log(`updater: ${m}`),
    debug: () => {},
  };
  const status = createUpdateStatus(onStatus);
  EVENTS.forEach((event) => autoUpdater.on(event, (payload) => status.handle(event, payload)));
  autoUpdater.on('update-downloaded', (info) => {
    log(`Update ${info.version} downloaded; installs on quit`);
    onReady(info.version);
  });
  const check = () =>
    autoUpdater.checkForUpdates().catch((err) => {
      log(`updater: ${err}`);
      status.handle('error', err);
    });
  check();
  setInterval(check, CHECK_INTERVAL_MS).unref();
  return {
    status: status.get,
    // The About page's button: starts a check unless one is already under way or done.
    checkNow: () => {
      if (!status.busy() && status.get().state !== 'ready') {
        status.handle('checking-for-update');
        check();
      }
      return status.get();
    },
    // Quit, install silently and start the new version.
    installNow: () => autoUpdater.quitAndInstall(true, true),
  };
}

module.exports = { startUpdater };

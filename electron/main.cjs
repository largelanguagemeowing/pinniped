const {
  app,
  BrowserWindow,
  shell,
  Menu,
  session,
  desktopCapturer,
  ipcMain,
  nativeImage,
  Tray,
  powerMonitor,
} = require('electron');
const path = require('path');
const { registerAppScheme, registerAppHandler, APP_ORIGIN } = require('./app-protocol.cjs');
const { buildAppMenu } = require('./menu.cjs');
const { createRichPresenceServer } = require('./rich-presence.cjs');
const screenShareAudio = require('./screenshare-audio.cjs');

// dist sits next to electron/ in both dev and the packaged asar
const DIST_DIR = path.join(__dirname, '..', 'dist');
// Unpacked from the asar (see asarUnpack): the OS reads the icon by path.
const APP_ICON = path
  .join(__dirname, 'build', 'icon.png')
  .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

// Dev only (`just dev-electron`): load the vite dev server (HMR) instead of the
// built bundle in dist/.
const DEV_SERVER_URL = process.env.CINNY_DEV_SERVER_URL;

// Dev runs get their own profile. Otherwise they share the installed app's profile, lose the
// single-instance lock below, quit, and just focus the installed window instead of the dev build.
// A separate profile also starts signed out, like a new device.
if (DEV_SERVER_URL) app.setPath('userData', path.join(app.getPath('appData'), 'pinniped-dev'));

// Dev only (`just dev-electron`): expose DevTools over CDP on localhost for layout debugging.
if (process.env.CINNY_DEV_RELOAD) app.commandLine.appendSwitch('remote-debugging-port', '9333');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Windows keeps running in the tray when the window is closed, like Discord,
// so notifications and sounds still arrive. Quit from the tray menu.
const CLOSE_TO_TRAY = process.platform === 'win32';

// Ties the running window's app-id / WM_CLASS to pinniped.desktop so GNOME
// associates it with the launcher entry and applies the right icon and name.
if (process.platform === 'linux') app.setDesktopName('pinniped');

// Windows toasts are attributed to the AppUserModelID; it has to match the one
// electron-builder writes into the Start menu shortcut (the appId), otherwise
// toasts show under the wrong name or are dropped.
if (process.platform === 'win32') app.setAppUserModelId('club.stablecat.pinniped');

// MSC4320 rich-presence publisher: impersonates Discord's local RPC pipe and
// forwards captured activity to the renderer to publish as the user's profile
// field. Created lazily on first request from the renderer (off by default).
let rpServer = null;
const ensureRichPresenceServer = () => {
  if (!rpServer) {
    rpServer = createRichPresenceServer({
      onActivity: (activity) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('rich-presence:activity', activity);
        }
      },
    });
  }
  return rpServer;
};

ipcMain.handle('rich-presence:start', async () => {
  try {
    return await ensureRichPresenceServer().start();
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
});
ipcMain.handle('rich-presence:stop', async () => {
  try {
    await rpServer?.stop();
  } catch {
    // ignore
  }
});

// System audio for screen shares on Linux; see screenshare-audio.cjs.
ipcMain.handle('screenshare-audio:prepare', () => screenShareAudio.prepare());
ipcMain.handle('screenshare-audio:link', (_event, active, output) =>
  screenShareAudio.link(active === true, typeof output === 'string' ? output : '')
);
ipcMain.handle('screenshare-audio:release', () => screenShareAudio.release());

// Seconds since the last keyboard/mouse input anywhere on the system; the
// renderer uses it for idle detection.
ipcMain.handle('system:idle-time', () => powerMonitor.getSystemIdleTime());

// Unread mentions and DMs shown on the app icon: dock badge (macOS), Unity
// launcher count (Linux, where the desktop supports it) and a taskbar overlay
// on Windows, where the renderer draws the bubble and sends it as a PNG data URL.
ipcMain.on('badge:set', (_event, payload) => {
  const count = Number.isInteger(payload?.count) && payload.count > 0 ? payload.count : 0;
  const hasUnread = count > 0 || payload?.hasUnread === true;
  app.setBadgeCount(count);
  if (process.platform === 'darwin' && hasUnread && count === 0) app.dock.setBadge('•');

  if (process.platform === 'win32' && mainWindow && !mainWindow.isDestroyed()) {
    const overlay =
      hasUnread && typeof payload?.overlay === 'string'
        ? nativeImage.createFromDataURL(payload.overlay)
        : null;
    mainWindow.setOverlayIcon(
      overlay,
      count > 0
        ? `${count} unread mentions and direct messages`
        : hasUnread
          ? 'Unread messages'
          : ''
    );
  }
});

function isInternalUrl(url) {
  return url.startsWith(APP_ORIGIN) || (DEV_SERVER_URL && url.startsWith(DEV_SERVER_URL));
}

// privileged scheme must be registered before the app is ready
registerAppScheme();

// getDisplayMedia() (screen share in calls) needs an explicit handler in
// Electron; on Wayland desktopCapturer routes through the xdg-desktop-portal
// picker, on X11 it grabs the primary screen.
function enableScreenShare() {
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen', 'window'] })
        .then((sources) =>
          callback(
            sources.length
              ? // Windows can capture system audio; the call widget turns local playback off
                // so the call is not shared back. Linux gets its audio from screenshare-audio.cjs.
                { video: sources[0], ...(process.platform === 'win32' && { audio: 'loopback' }) }
              : undefined
          )
        )
        .catch(() => callback());
    },
    { useSystemPicker: true }
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    // Keeps the sidebar, room list and call side by side.
    minWidth: 940,
    minHeight: 500,
    backgroundColor: '#15171e',
    autoHideMenuBar: true,
    title: 'Pinniped',
    // Linux taskbars read the window icon from here; without it Electron's
    // generic icon is shown instead of the desktop entry's icon.
    icon: APP_ICON,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      // keep sync and notification timers running while hidden in the tray
      backgroundThrottling: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Electron has no default browser context menu. Copy the rendered image so
  // authenticated media and decrypted blob URLs work without fetching again.
  const imageWindow = mainWindow;
  imageWindow.webContents.on('context-menu', (_event, params) => {
    if (params.mediaType !== 'image') return;
    Menu.buildFromTemplate([
      {
        label: 'Copy image',
        enabled: params.hasImageContents,
        click: () => {
          if (!imageWindow.isDestroyed()) {
            imageWindow.webContents.copyImageAt(params.x, params.y);
          }
        },
      },
    ]).popup({ window: imageWindow });
  });

  // open target=_blank / window.open externally, never as a child window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !isInternalUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // keep in-app navigation on our origin; send outbound links to the browser
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.on('close', (event) => {
    if (CLOSE_TO_TRAY && tray && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(DEV_SERVER_URL || `${APP_ORIGIN}/`);
  if (process.env.CINNY_DEV_RELOAD) watchDistForReload();
}

// Dev only (`just dev-electron`): reload the window whenever `vite build --watch`
// finishes writing a new index.html. Same origin as production, so the session sticks.
let reloadTimer = null;
function watchDistForReload() {
  const fs = require('fs');
  // Reloading destroys the call iframe, so leave the call properly first instead of
  // letting the widget get killed mid-call.
  const reloadAfterLeavingCall = async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      await Promise.race([
        mainWindow.webContents.executeJavaScript(
          'window.__leaveCall ? window.__leaveCall() : null'
        ),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch {
      // not in a call, or page not ready
    }
    // Plain reload: reloadIgnoringCache bypasses the service worker, which then can't add
    // the access token to authenticated media requests.
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
  };
  fs.watch(DIST_DIR, (_event, filename) => {
    if (filename !== 'index.html') return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(reloadAfterLeavingCall, 500);
  });
}

const showMainWindow = () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
};

function createTray() {
  tray = new Tray(nativeImage.createFromPath(APP_ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Pinniped');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Pinniped', click: showMainWindow },
      { type: 'separator' },
      {
        label: 'Quit Pinniped',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('click', showMainWindow);
}

// Clicking a notification while the window sits hidden in the tray: the
// renderer's window.focus() cannot unhide it, so the main process does.
ipcMain.on('window:show', showMainWindow);

// single instance; focus existing window on second launch
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);

  app.whenReady().then(() => {
    Menu.setApplicationMenu(buildAppMenu());
    registerAppHandler(DIST_DIR);
    enableScreenShare();
    createWindow();
    if (CLOSE_TO_TRAY) createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    isQuitting = true;
    rpServer?.stop();
    screenShareAudio.releaseSync();
  });
}

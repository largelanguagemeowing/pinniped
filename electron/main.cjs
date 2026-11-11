const {
  app,
  BrowserWindow,
  shell,
  Menu,
  clipboard,
  session,
  desktopCapturer,
  ipcMain,
  nativeImage,
  Tray,
  powerMonitor,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { registerAppScheme, registerAppHandler, APP_ORIGIN } = require('./app-protocol.cjs');
const { buildAppMenu } = require('./menu.cjs');
const { createRichPresenceServer } = require('./rich-presence.cjs');
const screenShareAudio = require('./screenshare-audio.cjs');

// Startup log: wall-clock lines on stdout plus a timing summary once the page is interactive.
const startupMarks = [];
function mark(name) {
  startupMarks.push([name, process.uptime() * 1000]);
}
function log(...args) {
  const t = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const ms = String(new Date().getMilliseconds()).padStart(3, '0');
  console.log(`${t}.${ms} ›`, ...args);
}
function logStartupTiming() {
  const rows = startupMarks.map(([name, ms]) => `|  ${`${name}:`.padEnd(32)} ${ms.toFixed(2)}`);
  console.log(`Startup timing:\n${rows.join('\n')}`);
}
mark('process-start');
log('Starting app.');

// dist sits next to electron/ in both dev and the packaged asar
const DIST_DIR = path.join(__dirname, '..', 'dist');
// Unpacked from the asar (see asarUnpack): the OS reads the icon by path.
const APP_ICON = path
  .join(__dirname, 'build', 'icon.png')
  .replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

// Asks the renderer to leave the call it is in, if any (see onLeaveCallRequest in preload.cjs),
// and gives the widget a moment to publish the leave. The renderer answers `call:left` with the
// request id and whether it was in a call. Never waits longer than a few seconds, so a hung
// renderer cannot block closing.
const LEAVE_CALL_TIMEOUT_MS = 3000;
let leavingCall = false;
let callLeft = false;
let leaveCallRequests = 0;
async function leaveCall() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const contents = mainWindow.webContents;
  leaveCallRequests += 1;
  const requestId = leaveCallRequests;
  const wasInCall = await new Promise((resolve) => {
    let timer;
    const onLeft = (event, id, inCall) => {
      if (event.sender !== contents || id !== requestId) return;
      clearTimeout(timer);
      ipcMain.removeListener('call:left', onLeft);
      resolve(inCall === true);
    };
    timer = setTimeout(() => {
      ipcMain.removeListener('call:left', onLeft);
      resolve(false);
    }, LEAVE_CALL_TIMEOUT_MS);
    ipcMain.on('call:left', onLeft);
    contents.send('call:leave', requestId);
  });
  if (wasInCall) await new Promise((resolve) => setTimeout(resolve, 500));
}

// Dev only (`just dev-electron`): load the vite dev server (HMR) instead of the
// built bundle in dist/.
const DEV_SERVER_URL = process.env.PINNIPED_DEV_SERVER_URL;

// The origins the app itself is served from, as scheme plus host and port. They are compared
// whole: a prefix match would also accept app://cinny.example or http://localhost:51730.
// (URL#origin is no use here: Node reports "null" for the app: scheme.)
const originOf = (url) => {
  const { protocol, host } = new URL(url);
  return `${protocol}//${host}`;
};
const INTERNAL_ORIGINS = new Set([APP_ORIGIN, DEV_SERVER_URL].filter(Boolean).map(originOf));
function isInternalUrl(url) {
  try {
    return INTERNAL_ORIGINS.has(originOf(url));
  } catch {
    return false;
  }
}

// IPC is only taken from the app's own window, while it shows the app: not from another
// webContents, and not from a page that is not ours. Preloads only run in the main frame, so
// subframes have no IPC to begin with.
const fromApp = (event) =>
  !!mainWindow &&
  !mainWindow.isDestroyed() &&
  event.sender === mainWindow.webContents &&
  isInternalUrl(event.senderFrame?.url ?? '');
const handleFromApp = (channel, handler) =>
  ipcMain.handle(channel, (event, ...args) => {
    if (!fromApp(event)) throw new Error(`${channel} is only available to Pinniped's own page`);
    return handler(event, ...args);
  });
const onFromApp = (channel, listener) =>
  ipcMain.on(channel, (event, ...args) => {
    if (fromApp(event)) listener(event, ...args);
  });

// Dev runs get their own profile. Otherwise they share the installed app's profile, lose the
// single-instance lock below, quit, and just focus the installed window instead of the dev build.
// A separate profile also starts signed out, like a new device.
if (DEV_SERVER_URL) app.setPath('userData', path.join(app.getPath('appData'), 'pinniped-dev'));

// Dev only (`just dev-electron`): expose DevTools over CDP on localhost for layout debugging.
if (process.env.PINNIPED_DEV_RELOAD) app.commandLine.appendSwitch('remote-debugging-port', '9333');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Windows keeps running in the tray when the window is closed,
// so notifications and sounds still arrive. Quit from the tray menu.
const CLOSE_TO_TRAY = process.platform === 'win32';

// Ties the running window's app-id / WM_CLASS to club.stablecat.pinniped.desktop so GNOME
// associates it with the launcher entry and applies the right icon and name.
if (process.platform === 'linux') app.setDesktopName('club.stablecat.pinniped');

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

handleFromApp('rich-presence:start', async () => {
  try {
    return await ensureRichPresenceServer().start();
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
});
handleFromApp('rich-presence:stop', async () => {
  try {
    await rpServer?.stop();
  } catch {
    // ignore
  }
});

// System audio for screen shares on Linux; see screenshare-audio.cjs.
handleFromApp('screenshare-audio:prepare', () => screenShareAudio.prepare());
handleFromApp('screenshare-audio:link', (_event, active, output) =>
  screenShareAudio.link(active === true, typeof output === 'string' ? output : '')
);
handleFromApp('screenshare-audio:release', () => screenShareAudio.release());

// Launch at login. Windows/macOS use the OS login items. Linux has no such
// API in Electron: outside a sandbox we write an XDG autostart entry, inside Flatpak (which
// cannot reach the host's ~/.config/autostart) we ask the Background portal over D-Bus.
// Autostart launches pass --hidden when "start minimized" is on; the window then goes to the
// tray where there is one, and is minimized otherwise.
const START_HIDDEN_ARG = '--hidden';
const IS_FLATPAK = process.platform === 'linux' && fs.existsSync('/.flatpak-info');
const linuxAutostartFile = () =>
  path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
    'autostart',
    'club.stablecat.pinniped.desktop'
  );
const { helper } = require('./helper.cjs');
const { hotkeys } = require('./hotkeys.cjs');
const startupStateFile = () => path.join(app.getPath('userData'), 'startup.json');
const readStartupState = () => {
  try {
    const state = JSON.parse(fs.readFileSync(startupStateFile(), 'utf8'));
    return { minimized: state.minimized !== false, portalEnabled: state.portalEnabled === true };
  } catch {
    return { minimized: true, portalEnabled: false };
  }
};
const writeStartupState = (patch) => {
  fs.writeFileSync(startupStateFile(), JSON.stringify({ ...readStartupState(), ...patch }));
};

const autostartArgs = (minimized) => (minimized ? [START_HIDDEN_ARG] : []);
const autostartCommand = (minimized) => {
  const exe = process.env.APPIMAGE || process.execPath;
  const entry = app.isPackaged ? [] : [app.getAppPath()];
  return [exe, ...entry, ...autostartArgs(minimized)];
};
const quoteDesktopArg = (arg) => `"${arg.replace(/(["`$\\])/g, '\\$1').replace(/%/g, '%%')}"`;

// Flatpak: RequestBackground is asynchronous and may show the user a permission dialog; we
// record the request and trust it, as the portal offers no cheap way to read the result back.
const requestPortalAutostart = async (enabled, minimized) => {
  const result = await helper.request({
    cmd: 'autostart',
    enabled,
    minimized,
    command: autostartCommand(minimized),
  });
  return result.ok;
};

const getStartup = () => {
  const { minimized, portalEnabled } = readStartupState();
  let enabled;
  if (process.platform === 'linux') {
    enabled = IS_FLATPAK ? portalEnabled : fs.existsSync(linuxAutostartFile());
  } else {
    enabled = app.getLoginItemSettings({ args: autostartArgs(minimized) }).openAtLogin;
  }
  return { enabled, minimized };
};
const setStartup = async (enabled, minimized) => {
  writeStartupState({ minimized });
  if (process.platform !== 'linux') {
    app.setLoginItemSettings({ openAtLogin: enabled, args: autostartArgs(minimized) });
  } else if (IS_FLATPAK) {
    if (await requestPortalAutostart(enabled, minimized))
      writeStartupState({ portalEnabled: enabled });
  } else if (!enabled) {
    fs.rmSync(linuxAutostartFile(), { force: true });
  } else {
    fs.mkdirSync(path.dirname(linuxAutostartFile()), { recursive: true });
    fs.writeFileSync(
      linuxAutostartFile(),
      [
        '[Desktop Entry]',
        'Type=Application',
        'Name=Pinniped',
        `Exec=${autostartCommand(minimized).map(quoteDesktopArg).join(' ')}`,
        'Icon=pinniped',
        'X-GNOME-Autostart-enabled=true',
        '',
      ].join('\n')
    );
  }
};
// Global shortcuts: the desktop portal on Linux, globalShortcut elsewhere (see hotkeys.cjs). The
// renderer gets each activation as a 'hotkey:activated' message with the shortcut id.
hotkeys.on('activated', (id) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('hotkey:activated', id);
});
handleFromApp('hotkeys:bind', (_event, shortcuts) => hotkeys.bind(shortcuts));

handleFromApp('startup:get', () => {
  try {
    return getStartup();
  } catch {
    return { enabled: false, minimized: true };
  }
});
handleFromApp('startup:set', async (_event, enabled, minimized) => {
  try {
    await setStartup(enabled === true, minimized !== false);
  } catch {
    // report the actual state below
  }
  return getStartup();
});

// Authenticated media: the homeserver wants a bearer token on media downloads and thumbnails,
// which <img>, <audio> and <video> cannot send themselves. On the web a service worker adds
// it; here the main process does, for every request of the session (the call iframe and
// workers included) with no worker to start, control or race. The renderer hands over the
// homeserver URL and token at login and clears them at logout (see src/sw-session.ts).
let mediaAuth = null;
const MEDIA_URL_PATTERNS = ['*://*/*_matrix/client/v1/media/*', '*://*/*_matrix/media/v3/*'];
onFromApp('media-auth:set', (_event, baseUrl, accessToken) => {
  try {
    const url = new URL(baseUrl);
    if (!/^https?:$/.test(url.protocol) || typeof accessToken !== 'string' || !accessToken) {
      throw new Error('invalid media session');
    }
    mediaAuth = { prefix: `${baseUrl.replace(/\/+$/, '')}/_matrix/`, accessToken };
  } catch {
    mediaAuth = null;
  }
});
function enableMediaAuth() {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: MEDIA_URL_PATTERNS },
    (details, callback) => {
      if (
        mediaAuth &&
        (details.method === 'GET' || details.method === 'HEAD') &&
        details.url.startsWith(mediaAuth.prefix)
      ) {
        callback({
          requestHeaders: {
            ...details.requestHeaders,
            Authorization: `Bearer ${mediaAuth.accessToken}`,
          },
        });
        return;
      }
      callback({ requestHeaders: details.requestHeaders });
    }
  );
}

// Seconds since the last keyboard/mouse input anywhere on the system; the
// renderer uses it for idle detection.
handleFromApp('system:idle-time', () => powerMonitor.getSystemIdleTime());

// Unread mentions and DMs shown on the app icon: dock badge (macOS), Unity
// launcher count (Linux, where the desktop supports it) and a taskbar overlay
// on Windows, where the renderer draws the bubble and sends it as a PNG data URL.
onFromApp('badge:set', (_event, payload) => {
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

// privileged scheme must be registered before the app is ready
registerAppScheme();

// Electron grants every permission to every page unless told otherwise. Pinniped's own pages get
// what they use: calls (microphone and camera, screen share, picking the speaker, keeping the
// screen awake), notifications, writing to the clipboard and fullscreen video. Anything else, and
// anything a page from another origin asks for, is denied.
const APP_PERMISSIONS = new Set([
  'media',
  'display-capture',
  'speaker-selection',
  'screen-wake-lock',
  'notifications',
  'clipboard-sanitized-write',
  'fullscreen',
]);
const isPermissionGranted = (permission, url) =>
  APP_PERMISSIONS.has(permission) && isInternalUrl(url);
function restrictPermissions() {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback, details) =>
    callback(isPermissionGranted(permission, details.requestingUrl))
  );
  session.defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    isPermissionGranted(permission, requestingOrigin)
  );
}

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
              ? // Video only. Windows loopback would also capture the call's own voices and send them
                // back into the share, so no audio is sent there. Linux gets its audio from
                // screenshare-audio.cjs, which leaves Pinniped's own output out.
                { video: sources[0] }
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

  // Started by autostart: stay in the tray instead of popping the window up.
  const startHidden = process.argv.includes(START_HIDDEN_ARG);
  mainWindow.once('ready-to-show', () => {
    if (!startHidden || (CLOSE_TO_TRAY && tray)) {
      // with a tray the window just stays hidden; without one, minimize it instead
      if (!startHidden) mainWindow.show();
      return;
    }
    mainWindow.showInactive();
    mainWindow.minimize();
  });

  // Electron has no default browser context menu, so build the one a browser would show.
  // The page's own menus (messages, rooms) cancel the event and never reach this.
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const contents = mainWindow.webContents;
    const groups = [];

    if (params.isEditable && params.misspelledWord) {
      const spelling = params.dictionarySuggestions.map((suggestion) => ({
        label: suggestion,
        click: () => contents.replaceMisspelling(suggestion),
      }));
      if (spelling.length === 0) spelling.push({ label: 'No suggestions', enabled: false });
      spelling.push({
        label: 'Add to dictionary',
        click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
      groups.push(spelling);
    }

    if (params.mediaType === 'image') {
      // Copy the rendered image so authenticated media and decrypted blob URLs
      // work without fetching again.
      groups.push([
        {
          label: 'Copy image',
          enabled: params.hasImageContents,
          click: () => contents.copyImageAt(params.x, params.y),
        },
      ]);
    }

    if (/^(https?|mailto|matrix):/.test(params.linkURL)) {
      groups.push([
        { label: 'Copy link address', click: () => clipboard.writeText(params.linkURL) },
      ]);
    }

    if (params.isEditable) {
      groups.push([
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { role: 'selectAll', enabled: params.editFlags.canSelectAll },
      ]);
    } else if (params.selectionText.trim() !== '') {
      groups.push([{ role: 'copy' }]);
    }

    if (groups.length === 0) return;
    const template = groups.flatMap((group, index) =>
      index === 0 ? group : [{ type: 'separator' }, ...group]
    );
    Menu.buildFromTemplate(template).popup({ window: mainWindow });
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
    // Closing destroys the call iframe, which would leave the call by killing the widget
    // mid-call and leave the membership to time out. Leave it first, then close for real.
    if (!callLeft) {
      event.preventDefault();
      if (leavingCall) return;
      leavingCall = true;
      leaveCall().finally(() => {
        leavingCall = false;
        callLeft = true;
        if (isQuitting) app.quit();
        else if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
        setImmediate(() => {
          callLeft = false;
        });
      });
      return;
    }
    if (CLOSE_TO_TRAY && tray && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const wc = mainWindow.webContents;
  log(`window.created "${mainWindow.getTitle()}"`);
  mark('window-created');
  wc.once('did-start-loading', () => mark('load-start'));
  wc.once('did-finish-load', () => {
    log('webContents.did-finish-load');
    mark('did-finish-load');
    logStartupTiming();
  });
  wc.on('did-fail-load', (_e, code, desc, url) => log(`did-fail-load ${code} ${desc} ${url}`));
  wc.on('render-process-gone', (_e, details) =>
    log('render-process-gone', JSON.stringify(details))
  );
  mainWindow.once('ready-to-show', () => {
    log('window.ready-to-show');
    mark('ready-to-show');
  });

  mainWindow.loadURL(DEV_SERVER_URL || `${APP_ORIGIN}/`);
  if (process.env.PINNIPED_DEV_RELOAD) watchDistForReload();
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
    await leaveCall();
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
onFromApp('window:show', showMainWindow);

// single instance; focus existing window on second launch
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);

  app.whenReady().then(() => {
    log('App ready');
    mark('app-ready');
    log(
      `Pinniped ${app.getVersion()} (electron ${process.versions.electron}, chrome ${process.versions.chrome}, node ${process.versions.node})`
    );
    log(
      `Platform: ${process.platform} ${process.arch}, session: ${process.env.XDG_SESSION_TYPE || 'n/a'}`
    );
    log(`userData: ${app.getPath('userData')}`);
    log(
      DEV_SERVER_URL ? `Dev server: ${DEV_SERVER_URL}` : `Loading ${APP_ORIGIN}/ from ${DIST_DIR}`
    );
    Menu.setApplicationMenu(buildAppMenu());
    registerAppHandler(DIST_DIR);
    log('App protocol registered');
    restrictPermissions();
    enableScreenShare();
    enableMediaAuth();
    log('Permissions, screen share and media auth set up');
    mark('handlers-ready');
    createWindow();
    if (CLOSE_TO_TRAY) {
      createTray();
      log('Tray created');
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    log('before-quit');
    isQuitting = true;
    rpServer?.stop();
    hotkeys.unregisterAll();
    // The helper exits when its stdin closes, and PipeWire then removes the screen share device.
    helper.stop();
  });
}

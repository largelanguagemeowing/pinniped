import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { vi } from 'vitest';

type Listener = (...args: unknown[]) => unknown;

/** A minimal event emitter, enough for the `on`/`once` the main process uses. */
const emitter = () => {
  const listeners = new Map<string, Listener[]>();
  return {
    on: vi.fn((name: string, listener: Listener) => {
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
    }),
    once: vi.fn((name: string, listener: Listener) => {
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
    }),
    removeListener: vi.fn((name: string, listener: Listener) => {
      listeners.set(
        name,
        (listeners.get(name) ?? []).filter((l) => l !== listener)
      );
    }),
    emit: (name: string, ...args: unknown[]) =>
      (listeners.get(name) ?? []).forEach((listener) => listener(...args)),
    listeners: (name: string) => listeners.get(name) ?? [],
  };
};

export type FakeWindow = ReturnType<typeof createWindow>;

const createWindow = () => {
  const events = emitter();
  const webContents = {
    ...emitter(),
    send: vi.fn(),
    setWindowOpenHandler: vi.fn(),
  };
  return {
    ...events,
    webContents,
    getTitle: () => 'Pinniped',
    loadURL: vi.fn(),
    isDestroyed: () => false,
    close: vi.fn(),
    hide: vi.fn(),
    setOverlayIcon: vi.fn(),
  };
};

/**
 * Runs electron/main.cjs against a mocked Electron, as the desktop app does at startup, and
 * returns the mocks: the IPC listeners and handlers it registered and the window it created.
 */
export const loadElectronMain = async (platform: NodeJS.Platform = 'linux') => {
  const ipcMain = emitter();
  const handlers = new Map<string, Listener>();
  const windows: FakeWindow[] = [];
  const app = {
    ...emitter(),
    setAppUserModelId: vi.fn(),
    setDesktopName: vi.fn(),
    setBadgeCount: vi.fn(),
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    getVersion: () => '0.0.0',
    getPath: () => '/userdata',
    quit: vi.fn(),
  };
  const electron = {
    app,
    ipcMain: {
      ...ipcMain,
      handle: (name: string, handler: Listener) => handlers.set(name, handler),
    },
    BrowserWindow: Object.assign(
      vi.fn().mockImplementation(function BrowserWindow() {
        const window = createWindow();
        windows.push(window);
        return window;
      }),
      { getAllWindows: () => windows }
    ),
    Tray: vi.fn().mockImplementation(function Tray() {
      return { setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn() };
    }),
    Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn() },
    session: {
      defaultSession: {
        setDisplayMediaRequestHandler: vi.fn(),
        webRequest: { onBeforeSendHeaders: vi.fn() },
      },
    },
    nativeImage: {
      createFromDataURL: vi.fn(() => ({ png: true })),
      createFromPath: () => ({ resize: vi.fn() }),
    },
    powerMonitor: { getSystemIdleTime: () => 0 },
  };

  runInNewContext(readFileSync(new URL('../../../electron/main.cjs', import.meta.url), 'utf8'), {
    __dirname: '/app/electron',
    // A bare context has none of Node's globals; the main process reads its own origin on load.
    URL,
    setTimeout,
    clearTimeout,
    setImmediate,
    console: { log: () => undefined },
    process: { platform, env: {}, argv: [], uptime: () => 0, versions: {} },
    require: (name: string) => {
      if (name === 'electron') return electron;
      if (name === 'path') return { join: (...parts: string[]) => parts.join('/'), sep: '/' };
      if (name === 'fs') return { existsSync: () => false };
      if (name === './app-protocol.cjs')
        return {
          registerAppScheme: vi.fn(),
          registerAppHandler: vi.fn(),
          APP_ORIGIN: 'app://cinny',
        };
      if (name === './menu.cjs') return { buildAppMenu: vi.fn() };
      if (name === './helper.cjs')
        return { helper: { on: vi.fn(), request: vi.fn(), stop: vi.fn() } };
      if (name === './hotkeys.cjs')
        return { hotkeys: { on: vi.fn(), bind: vi.fn(), unregisterAll: vi.fn() } };
      return {};
    },
  });
  // Let app.whenReady() run and create the window.
  await Promise.resolve();
  await Promise.resolve();

  return { electron, app, ipcMain, handlers, windows };
};

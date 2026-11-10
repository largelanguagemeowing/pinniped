import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

describe('Windows badge IPC', () => {
  it('keeps the unread dot with count zero and clears the overlay when read', async () => {
    const handlers = new Map();
    const overlay = { png: true };
    const setOverlayIcon = vi.fn();
    const setBadgeCount = vi.fn();
    const createFromDataURL = vi.fn(() => overlay);
    const Window = vi.fn().mockImplementation(function () {
      return {
        webContents: { on: vi.fn(), once: vi.fn(), setWindowOpenHandler: vi.fn() },
        getTitle: () => 'Pinniped',
        once: vi.fn(),
        on: vi.fn(),
        loadURL: vi.fn(),
        isDestroyed: () => false,
        setOverlayIcon,
      };
    });
    const Tray = vi.fn().mockImplementation(function () {
      return {
        setToolTip: vi.fn(),
        setContextMenu: vi.fn(),
        on: vi.fn(),
      };
    });
    const electron = {
      app: {
        setAppUserModelId: vi.fn(),
        setBadgeCount,
        requestSingleInstanceLock: () => true,
        on: vi.fn(),
        whenReady: () => Promise.resolve(),
        getVersion: () => '0.0.0',
        getPath: () => '/userdata',
      },
      ipcMain: {
        handle: vi.fn(),
        on: (name: string, callback: unknown) => handlers.set(name, callback),
      },
      BrowserWindow: Window,
      Tray,
      Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn() },
      session: {
        defaultSession: {
          setDisplayMediaRequestHandler: vi.fn(),
          webRequest: { onBeforeSendHeaders: vi.fn() },
        },
      },
      nativeImage: { createFromDataURL, createFromPath: () => ({ resize: vi.fn() }) },
    };
    runInNewContext(readFileSync(new URL('../../electron/main.cjs', import.meta.url), 'utf8'), {
      __dirname: '/app/electron',
      // A bare context has none of Node's globals; the main process reads its own origin on load.
      URL,
      process: { platform: 'win32', env: {}, argv: [], uptime: () => 0, versions: {} },
      require: (name: string) => {
        if (name === 'electron') return electron;
        if (name === 'path') return { join: (...parts: string[]) => parts.join('/') };
        if (name === './app-protocol.cjs')
          return {
            registerAppScheme: vi.fn(),
            registerAppHandler: vi.fn(),
            APP_ORIGIN: 'app://pinniped',
          };
        if (name === './menu.cjs') return { buildAppMenu: vi.fn() };
        if (name === './helper.cjs')
          return { helper: { on: vi.fn(), request: vi.fn(), stop: vi.fn() } };
        if (name === './hotkeys.cjs')
          return { hotkeys: { on: vi.fn(), bind: vi.fn(), unregisterAll: vi.fn() } };
        return {};
      },
    });
    await Promise.resolve();
    const update = handlers.get('badge:set');
    update({}, { count: 0, hasUnread: true, overlay: 'data:image/png;base64,dot' });
    expect(setBadgeCount).toHaveBeenLastCalledWith(0);
    expect(setOverlayIcon).toHaveBeenLastCalledWith(overlay, 'Unread messages');
    update({}, { count: 5, hasUnread: true, overlay: 'data:image/png;base64,count' });
    expect(setOverlayIcon).toHaveBeenLastCalledWith(
      overlay,
      '5 unread mentions and direct messages'
    );
    update({}, { count: 0, hasUnread: false });
    expect(setOverlayIcon).toHaveBeenLastCalledWith(null, '');
  });
});

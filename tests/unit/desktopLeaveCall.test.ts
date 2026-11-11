import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { loadElectronMain } from './support/electronMain';

type Listener = (...args: unknown[]) => unknown;

/** Runs electron/preload.cjs and returns the page API it exposes and the IPC it uses. */
const loadPreload = () => {
  const listeners = new Map<string, Listener>();
  const ipcRenderer = {
    on: (name: string, listener: Listener) => listeners.set(name, listener),
    removeListener: vi.fn(),
    send: vi.fn(),
    invoke: vi.fn(),
  };
  let api: Record<string, unknown> = {};
  runInNewContext(readFileSync(new URL('../../electron/preload.cjs', import.meta.url), 'utf8'), {
    process: { platform: 'linux', versions: {} },
    require: (name: string) =>
      name === 'electron'
        ? {
            ipcRenderer,
            contextBridge: {
              exposeInMainWorld: (_key: string, value: Record<string, unknown>) => {
                api = value;
              },
            },
          }
        : {},
  });
  const askToLeave = async (requestId: number) => {
    await listeners.get('call:leave')?.({}, requestId);
  };
  return { api, ipcRenderer, askToLeave };
};

describe('leaving the call before the desktop window closes', () => {
  it('answers at once when the page is not in a call', async () => {
    const { ipcRenderer, askToLeave } = loadPreload();
    await askToLeave(1);
    expect(ipcRenderer.send).toHaveBeenCalledWith('call:left', 1, false);
  });

  it('leaves through the page handler, and stops after it is unregistered', async () => {
    const { api, ipcRenderer, askToLeave } = loadPreload();
    const hangup = vi.fn(() => Promise.resolve());
    const unregister = (api.onLeaveCallRequest as (h: () => Promise<void>) => () => void)(hangup);

    await askToLeave(2);
    expect(hangup).toHaveBeenCalledTimes(1);
    expect(ipcRenderer.send).toHaveBeenLastCalledWith('call:left', 2, true);

    unregister();
    await askToLeave(3);
    expect(hangup).toHaveBeenCalledTimes(1);
    expect(ipcRenderer.send).toHaveBeenLastCalledWith('call:left', 3, false);
  });

  it('still answers when leaving fails', async () => {
    const { api, ipcRenderer, askToLeave } = loadPreload();
    (api.onLeaveCallRequest as (h: () => Promise<void>) => void)(() =>
      Promise.reject(new Error('widget gone'))
    );
    await askToLeave(4);
    expect(ipcRenderer.send).toHaveBeenLastCalledWith('call:left', 4, false);
  });

  it('closes the window once the page has answered', async () => {
    const { windows, ipcMain } = await loadElectronMain();
    const [window] = windows;
    const preventDefault = vi.fn();

    window.emit('close', { preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(window.webContents.send).toHaveBeenCalledWith('call:leave', 1);
    expect(window.close).not.toHaveBeenCalled();

    // An answer from another page, or to another request, is not this one.
    ipcMain.emit('call:left', { sender: {} }, 1, false);
    ipcMain.emit('call:left', { sender: window.webContents }, 7, false);
    await Promise.resolve();
    expect(window.close).not.toHaveBeenCalled();

    ipcMain.emit('call:left', { sender: window.webContents }, 1, false);
    await vi.waitFor(() => expect(window.close).toHaveBeenCalled());
    expect(ipcMain.listeners('call:left')).toHaveLength(0);
  });
});

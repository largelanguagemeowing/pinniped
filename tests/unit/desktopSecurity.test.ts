import { describe, expect, it } from 'vitest';
import { loadElectronMain } from './support/electronMain';

describe('desktop permissions', () => {
  const ask = (
    handler: ((...args: unknown[]) => unknown) | undefined,
    permission: string,
    url: string
  ) =>
    new Promise<boolean>((resolve) => {
      handler?.({}, permission, resolve, { requestingUrl: url, isMainFrame: true });
    });

  it("grants what calls and notifications need to the app's own pages", async () => {
    const { permissions } = await loadElectronMain();
    expect(await ask(permissions.request, 'media', 'app://cinny/')).toBe(true);
    expect(
      await ask(permissions.request, 'display-capture', 'app://cinny/public/element-call/')
    ).toBe(true);
    expect(await ask(permissions.request, 'notifications', 'app://cinny/home')).toBe(true);
    expect(permissions.check?.({}, 'media', 'app://cinny', {})).toBe(true);
  });

  it('denies permissions the app does not use, even to its own pages', async () => {
    const { permissions } = await loadElectronMain();
    expect(await ask(permissions.request, 'geolocation', 'app://cinny/')).toBe(false);
    expect(await ask(permissions.request, 'openExternal', 'app://cinny/')).toBe(false);
    expect(await ask(permissions.request, 'clipboard-read', 'app://cinny/')).toBe(false);
    expect(permissions.check?.({}, 'hid', 'app://cinny', {})).toBe(false);
  });

  it('denies everything to pages from other origins', async () => {
    const { permissions } = await loadElectronMain();
    expect(await ask(permissions.request, 'media', 'https://example.org/')).toBe(false);
    expect(await ask(permissions.request, 'notifications', 'app://cinny.example/')).toBe(false);
    expect(permissions.check?.({}, 'media', 'https://example.org', {})).toBe(false);
    expect(permissions.check?.({}, 'media', '', {})).toBe(false);
  });
});

describe('desktop IPC', () => {
  it("only takes messages from the app's own page", async () => {
    const { app, ipcMain, windows, fromPage } = await loadElectronMain();
    const [window] = windows;
    const setBadge = (event: unknown) => ipcMain.emit('badge:set', event, { count: 3 });

    setBadge({ sender: {}, senderFrame: { url: 'app://cinny/' } });
    setBadge(fromPage(window, 'https://example.org/'));
    setBadge({ sender: window.webContents, senderFrame: null });
    expect(app.setBadgeCount).not.toHaveBeenCalled();

    setBadge(fromPage(window));
    expect(app.setBadgeCount).toHaveBeenCalledWith(3);
  });

  it('rejects invoked calls from anywhere else', async () => {
    const { handlers, windows, fromPage } = await loadElectronMain();
    const [window] = windows;
    const idleTime = handlers.get('system:idle-time')!;

    expect(() => idleTime(fromPage(window, 'https://example.org/'))).toThrow(
      "system:idle-time is only available to Pinniped's own page"
    );
    expect(idleTime(fromPage(window))).toBe(0);
  });
});

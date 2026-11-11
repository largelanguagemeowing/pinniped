import { describe, expect, it } from 'vitest';
import { loadElectronMain } from './support/electronMain';

describe('Windows badge IPC', () => {
  it('keeps the unread dot with count zero and clears the overlay when read', async () => {
    const { app, ipcMain, windows } = await loadElectronMain('win32');
    const [window] = windows;
    // What the mocked nativeImage.createFromDataURL returns.
    const overlay = { png: true };
    const update = (payload: unknown) =>
      ipcMain.emit('badge:set', { sender: window.webContents }, payload);

    update({ count: 0, hasUnread: true, overlay: 'data:image/png;base64,dot' });
    expect(app.setBadgeCount).toHaveBeenLastCalledWith(0);
    expect(window.setOverlayIcon).toHaveBeenLastCalledWith(overlay, 'Unread messages');
    update({ count: 5, hasUnread: true, overlay: 'data:image/png;base64,count' });
    expect(window.setOverlayIcon).toHaveBeenLastCalledWith(
      overlay,
      '5 unread mentions and direct messages'
    );
    update({ count: 0, hasUnread: false });
    expect(window.setOverlayIcon).toHaveBeenLastCalledWith(null, '');
  });
});

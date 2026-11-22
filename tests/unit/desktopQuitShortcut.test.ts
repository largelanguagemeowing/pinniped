import { describe, expect, it } from 'vitest';
import { loadElectronMain } from './support/electronMain';

describe('Ctrl+Q setting', () => {
  it('starts with the menu built from the saved choice', async () => {
    const { buildAppMenu, quitShortcutPreference } = await loadElectronMain();
    expect(quitShortcutPreference.readEnabled).toHaveBeenCalledWith('/userdata');
    expect(buildAppMenu).toHaveBeenCalledWith({ quitShortcut: false });
  });

  it('saves a change and rebuilds the menu at once', async () => {
    const { handlers, windows, fromPage, buildAppMenu, quitShortcutPreference, electron } =
      await loadElectronMain();
    const [window] = windows;

    expect(await handlers.get('quit-shortcut:set')!(fromPage(window), true)).toBe(true);
    expect(quitShortcutPreference.writeEnabled).toHaveBeenLastCalledWith('/userdata', true);
    expect(buildAppMenu).toHaveBeenLastCalledWith({ quitShortcut: true });
    expect(electron.Menu.setApplicationMenu).toHaveBeenCalledTimes(2);

    // Only a real true turns it on.
    expect(await handlers.get('quit-shortcut:set')!(fromPage(window), 'yes')).toBe(false);
    expect(buildAppMenu).toHaveBeenLastCalledWith({ quitShortcut: false });
  });

  it('reads the saved choice', async () => {
    const { handlers, windows, fromPage, quitShortcutPreference } = await loadElectronMain();
    const [window] = windows;
    quitShortcutPreference.readEnabled.mockReturnValue(true);
    expect(await handlers.get('quit-shortcut:get')!(fromPage(window))).toBe(true);
  });

  it("only answers the app's own page", async () => {
    const { handlers, windows, fromPage, quitShortcutPreference } = await loadElectronMain();
    const [window] = windows;
    expect(() =>
      handlers.get('quit-shortcut:set')!(fromPage(window, 'https://example.org/'), true)
    ).toThrow("quit-shortcut:set is only available to Pinniped's own page");
    expect(quitShortcutPreference.writeEnabled).not.toHaveBeenCalled();
  });
});

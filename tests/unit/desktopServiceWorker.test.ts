import { describe, expect, it } from 'vitest';
import { loadElectronMain } from './support/electronMain';

describe('desktop service workers', () => {
  it('removes service workers before the window loads the app', async () => {
    const { electron, windows } = await loadElectronMain();
    const { clearStorageData } = electron.session.defaultSession;

    expect(clearStorageData).toHaveBeenCalledWith({ storages: ['serviceworkers'] });
    expect(windows).toHaveLength(1);
    expect(clearStorageData.mock.invocationCallOrder[0]).toBeLessThan(
      windows[0].loadURL.mock.invocationCallOrder[0]
    );
  });

  it('waits for the removal to finish before opening the window', async () => {
    let finish = () => undefined as void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const { windows } = await loadElectronMain('linux', { clearStorageData: () => pending });
    expect(windows).toHaveLength(0);

    finish();
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    expect(windows).toHaveLength(1);
    expect(windows[0].loadURL).toHaveBeenCalledTimes(1);
  });

  it('still opens the window when the removal fails', async () => {
    const { windows } = await loadElectronMain('linux', {
      clearStorageData: () => Promise.reject(new Error('storage busy')),
    });

    expect(windows).toHaveLength(1);
    expect(windows[0].loadURL).toHaveBeenCalledTimes(1);
  });
});

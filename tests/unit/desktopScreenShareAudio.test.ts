import { describe, expect, it } from 'vitest';
import { loadElectronMain } from './support/electronMain';

describe('desktop screen share audio', () => {
  it('lists the playing applications for the output and exclusions the page gives', async () => {
    const { handlers, windows, fromPage, screenShareAudio } = await loadElectronMain();
    await handlers.get('screenshare-audio:apps')!(fromPage(windows[0]), 'Speakers', ['a.exe', 3]);
    expect(screenShareAudio.apps).toHaveBeenCalledWith('Speakers', ['a.exe']);
  });

  it('limits a share to one application only for a non-empty id', async () => {
    const { handlers, windows, fromPage, screenShareAudio } = await loadElectronMain();
    const link = handlers.get('screenshare-audio:link')!;
    const page = fromPage(windows[0]);

    await link(page, true, 'Speakers', [], 'spotify.exe');
    await link(page, true, 'Speakers', [], '');
    await link(page, true, 'Speakers', [], { id: 'spotify.exe' });

    expect(screenShareAudio.link.mock.calls).toEqual([
      [true, 'Speakers', [], 'spotify.exe'],
      [true, 'Speakers', [], undefined],
      [true, 'Speakers', [], undefined],
    ]);
  });

  it("only answers Pinniped's own page", async () => {
    const { handlers, windows, fromPage, screenShareAudio } = await loadElectronMain();
    const apps = handlers.get('screenshare-audio:apps')!;
    expect(() => apps(fromPage(windows[0], 'https://example.org/'), '', [])).toThrow();
    expect(screenShareAudio.apps).not.toHaveBeenCalled();
  });
});

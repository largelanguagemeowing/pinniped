import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

interface Item {
  role?: string;
  label?: string;
  accelerator?: string;
  submenu?: Item[];
}

/** The application menu's template as menu.cjs builds it, on the given platform. */
const template = (platform: string, options?: { quitShortcut: boolean }): Item[] => {
  const source = readFileSync('electron/menu.cjs', 'utf8');
  const module = { exports: {} as { buildAppMenu: (o?: { quitShortcut: boolean }) => Item[] } };
  runInNewContext(source, {
    module,
    process: { platform },
    require: () => ({
      app: { quit: () => undefined },
      Menu: { buildFromTemplate: (t: Item[]) => t },
    }),
  });
  return module.exports.buildAppMenu(options);
};

const flatten = (items: Item[]): Item[] =>
  items.flatMap((item) => [item, ...flatten(item.submenu ?? [])]);

describe('application menu', () => {
  it.each(['linux', 'win32', 'darwin'])(
    'has nothing that closes the window with a keypress on %s',
    (platform) => {
      const items = flatten(template(platform));
      expect(items.filter((i) => i.role === 'close' || i.role === 'fileMenu')).toEqual([]);
      expect(items.filter((i) => i.role === 'windowMenu')).toEqual([]);
      expect(items.filter((i) => /(^|\+)W$/i.test(i.accelerator ?? ''))).toEqual([]);
    }
  );

  describe('Quit', () => {
    const quit = (items: Item[]) =>
      flatten(items).filter((i) => i.role === 'quit' || i.label === 'Quit');

    it.each(['linux', 'win32'])(
      'has no Ctrl+Q by default on %s, but is still there',
      (platform) => {
        const items = quit(template(platform));
        expect(items).toHaveLength(1);
        expect(items[0].role).toBeUndefined();
        expect(items[0].accelerator).toBeUndefined();
      }
    );

    it.each(['linux', 'win32'])('is the standard quit role when enabled on %s', (platform) => {
      expect(quit(template(platform, { quitShortcut: true })).map((i) => i.role)).toEqual(['quit']);
    });
  });

  it('still has the reload, zoom and developer tool items', () => {
    const roles = flatten(template('linux')).map((i) => i.role);
    expect(roles).toEqual(
      expect.arrayContaining(['reload', 'toggleDevTools', 'zoomIn', 'minimize'])
    );
  });
});

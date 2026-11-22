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
const template = (platform: string): Item[] => {
  const source = readFileSync('electron/menu.cjs', 'utf8');
  const module = { exports: {} as { buildAppMenu: () => Item[] } };
  runInNewContext(source, {
    module,
    process: { platform },
    require: () => ({ Menu: { buildFromTemplate: (t: Item[]) => t } }),
  });
  return module.exports.buildAppMenu();
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

  it('still has the reload, zoom and developer tool items', () => {
    const roles = flatten(template('linux')).map((i) => i.role);
    expect(roles).toEqual(
      expect.arrayContaining(['reload', 'toggleDevTools', 'zoomIn', 'minimize'])
    );
  });
});

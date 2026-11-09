import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { toAccelerator } = require('../../electron/accelerator.cjs') as {
  toAccelerator: (trigger: unknown) => string | undefined;
};

describe('toAccelerator', () => {
  it.each([
    ['CTRL+ALT+m', 'Control+Alt+M'],
    ['SHIFT+LOGO+d', 'Shift+Super+D'],
    ['CTRL+7', 'Control+7'],
    ['F9', 'F9'],
    ['F12', 'F12'],
    ['ALT+F4', 'Alt+F4'],
    ['CTRL+space', 'Control+Space'],
    ['CTRL+Return', 'Control+Enter'],
    ['CTRL+Page_Up', 'Control+PageUp'],
    ['CTRL+BackSpace', 'Control+Backspace'],
  ])('converts %s to %s', (trigger, accelerator) => {
    expect(toAccelerator(trigger)).toBe(accelerator);
  });

  it.each([
    ['a key without a modifier', 'm'],
    ['an unknown modifier', 'HYPER+m'],
    ['an unsupported key', 'CTRL+grave'],
    ['an F-key past F12', 'F13'],
    ['a trailing plus', 'CTRL+'],
    ['an empty trigger', ''],
    ['a non-string', 42],
  ])('rejects %s', (_label, trigger) => {
    expect(toAccelerator(trigger)).toBeUndefined();
  });
});

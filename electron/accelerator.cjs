// Converts the trigger format the call settings store (XDG shortcut syntax, e.g. CTRL+ALT+m,
// SHIFT+LOGO+d, F9) into an Electron accelerator (e.g. Control+Alt+M). Used where Electron's
// globalShortcut registers keys: Windows and macOS, and Linux desktops without the portal.

const MODIFIERS = { CTRL: 'Control', ALT: 'Alt', SHIFT: 'Shift', LOGO: 'Super' };

const KEYS = {
  space: 'Space',
  Up: 'Up',
  Down: 'Down',
  Left: 'Left',
  Right: 'Right',
  Return: 'Enter',
  Tab: 'Tab',
  BackSpace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  Page_Up: 'PageUp',
  Page_Down: 'PageDown',
  Insert: 'Insert',
};

/** The accelerator for a trigger, or undefined if it cannot be expressed. */
const toAccelerator = (trigger) => {
  if (typeof trigger !== 'string') return undefined;
  const parts = trigger.split('+');
  const key = parts.pop();
  const modifiers = parts.map((part) => MODIFIERS[part]);
  if (!key || modifiers.some((m) => m === undefined)) return undefined;
  if (modifiers.length === 0 && !/^F\d+$/.test(key)) return undefined;

  let name;
  if (/^F([1-9]|1[0-2])$/.test(key)) name = key;
  else if (KEYS[key] !== undefined) name = KEYS[key];
  else if (/^[a-zA-Z0-9]$/.test(key)) name = key.toUpperCase();
  else return undefined;

  return [...modifiers, name].join('+');
};

module.exports = { toAccelerator };

// Global shortcuts for call actions. The desktop helper binds them with the freedesktop portal,
// which takes triggers in the XDG format: modifiers and a key joined by '+', e.g. CTRL+ALT+m.

export type CallHotkeyAction = 'mute' | 'deafen';

export const CALL_HOTKEY_ACTIONS: { id: CallHotkeyAction; label: string }[] = [
  { id: 'mute', label: 'Mute or unmute your microphone' },
  { id: 'deafen', label: 'Deafen or undeafen' },
];

export type CallHotkeyBindings = Partial<Record<CallHotkeyAction, string>>;

/** Keys whose names differ from XKB keysyms; anything else single-character is used as typed. */
const KEY_SYMS: Record<string, string> = {
  ' ': 'space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Return',
  Tab: 'Tab',
  Backspace: 'BackSpace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'Page_Up',
  PageDown: 'Page_Down',
  Insert: 'Insert',
};

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'OS']);

export type KeyPress = {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

/**
 * The XDG trigger for a key press, or undefined if it cannot be a global shortcut. A shortcut
 * needs at least one modifier (a bare letter would steal typing in every application); function
 * keys are the exception.
 */
export const shortcutFromKeyPress = (press: KeyPress): string | undefined => {
  if (MODIFIER_KEYS.has(press.key)) return undefined;

  let key: string | undefined;
  if (press.key in KEY_SYMS) key = KEY_SYMS[press.key];
  else if (/^F([1-9]|1[0-2])$/.test(press.key)) key = press.key;
  else if (press.key.length === 1) key = press.key.toLowerCase();
  if (!key) return undefined;

  const modifiers: string[] = [];
  if (press.ctrlKey) modifiers.push('CTRL');
  if (press.altKey) modifiers.push('ALT');
  if (press.shiftKey) modifiers.push('SHIFT');
  if (press.metaKey) modifiers.push('LOGO');
  if (modifiers.length === 0 && !/^F\d+$/.test(key)) return undefined;

  return [...modifiers, key].join('+');
};

export type HotkeyShortcut = { id: CallHotkeyAction; description: string; trigger: string };

/** The shortcuts to bind, one per action that has a trigger. */
export const bindingsToShortcuts = (bindings: CallHotkeyBindings): HotkeyShortcut[] =>
  CALL_HOTKEY_ACTIONS.flatMap(({ id, label }) => {
    const trigger = bindings[id];
    return trigger ? [{ id, description: label, trigger }] : [];
  });

export const isCallHotkeyAction = (id: string): id is CallHotkeyAction =>
  CALL_HOTKEY_ACTIONS.some((action) => action.id === id);

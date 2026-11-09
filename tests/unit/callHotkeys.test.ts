import { describe, expect, it } from 'vitest';
import {
  bindingsToShortcuts,
  isCallHotkeyAction,
  shortcutFromKeyPress,
} from '../../src/app/features/call-hotkeys/hotkeys';

const press = (
  key: string,
  mods: Partial<Record<'ctrl' | 'alt' | 'shift' | 'meta', true>> = {}
) => ({
  key,
  ctrlKey: mods.ctrl === true,
  altKey: mods.alt === true,
  shiftKey: mods.shift === true,
  metaKey: mods.meta === true,
});

describe('shortcutFromKeyPress', () => {
  it('writes modifiers in XDG order with a lower-case letter', () => {
    expect(shortcutFromKeyPress(press('M', { ctrl: true, alt: true }))).toBe('CTRL+ALT+m');
    expect(shortcutFromKeyPress(press('d', { meta: true, shift: true }))).toBe('SHIFT+LOGO+d');
  });

  it('refuses a bare key, which would steal typing in other applications', () => {
    expect(shortcutFromKeyPress(press('m'))).toBeUndefined();
    expect(shortcutFromKeyPress(press('Enter'))).toBeUndefined();
  });

  it('allows a function key without a modifier', () => {
    expect(shortcutFromKeyPress(press('F9'))).toBe('F9');
  });

  it('ignores a lone modifier press', () => {
    expect(shortcutFromKeyPress(press('Control', { ctrl: true }))).toBeUndefined();
  });

  it('maps named keys to their keysym names', () => {
    expect(shortcutFromKeyPress(press('ArrowUp', { alt: true }))).toBe('ALT+Up');
    expect(shortcutFromKeyPress(press(' ', { ctrl: true }))).toBe('CTRL+space');
  });

  it('refuses keys it cannot name', () => {
    expect(shortcutFromKeyPress(press('Dead', { ctrl: true }))).toBeUndefined();
  });
});

describe('bindingsToShortcuts', () => {
  it('lists only the actions that have a trigger, with their labels', () => {
    const shortcuts = bindingsToShortcuts({ deafen: 'CTRL+ALT+d' });
    expect(shortcuts).toEqual([
      { id: 'deafen', description: 'Deafen or undeafen', trigger: 'CTRL+ALT+d' },
    ]);
  });

  it('returns nothing when no action is bound', () => {
    expect(bindingsToShortcuts({})).toEqual([]);
  });
});

describe('isCallHotkeyAction', () => {
  it('accepts only the known actions', () => {
    expect(isCallHotkeyAction('mute')).toBe(true);
    expect(isCallHotkeyAction('leave')).toBe(false);
  });
});

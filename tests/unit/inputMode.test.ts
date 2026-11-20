// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INPUT_MODE_ATTRIBUTE, trackInputMode } from '../../src/app/utils/inputMode';

const mode = () => document.documentElement.getAttribute(INPUT_MODE_ATTRIBUTE);
const key = (init: KeyboardEventInit, target: EventTarget = document.body) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
const press = (target: EventTarget = document.body) =>
  target.dispatchEvent(new Event('pointerdown', { bubbles: true }));

describe('trackInputMode', () => {
  let stop: () => void;
  beforeEach(() => {
    document.documentElement.removeAttribute(INPUT_MODE_ATTRIBUTE);
    stop = trackInputMode(document);
  });
  afterEach(() => stop());

  it('starts in pointer mode', () => {
    expect(mode()).toBe('pointer');
  });

  it('enters keyboard mode on Tab and Shift+Tab', () => {
    key({ key: 'Tab' });
    expect(mode()).toBe('keyboard');
    press();
    key({ key: 'Tab', shiftKey: true });
    expect(mode()).toBe('keyboard');
  });

  it('stays in pointer mode for keys that do not move focus', () => {
    ['ArrowDown', 'Escape', 'Enter', 'Shift', 'a'].forEach((k) => key({ key: k }));
    key({ key: 'c', ctrlKey: true });
    key({ key: 'Tab', ctrlKey: true });
    key({ key: 'Tab', altKey: true });
    key({ key: 'Tab', metaKey: true });
    expect(mode()).toBe('pointer');
  });

  it('leaves keyboard mode on a pointer press', () => {
    key({ key: 'Tab' });
    press();
    expect(mode()).toBe('pointer');
  });

  it('sees Tab even when a handler stops it', () => {
    const trap = document.createElement('div');
    document.body.append(trap);
    trap.addEventListener('keydown', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
    });
    key({ key: 'Tab' }, trap);
    expect(mode()).toBe('keyboard');
    trap.remove();
  });

  it('stops tracking once disposed', () => {
    stop();
    key({ key: 'Tab' });
    expect(mode()).toBe('pointer');
  });
});

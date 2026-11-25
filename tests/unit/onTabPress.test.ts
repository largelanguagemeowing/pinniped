// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { onTabPress } from '../../src/app/utils/keyboard';

describe('onTabPress', () => {
  it('runs for Tab', () => {
    const accept = vi.fn();
    onTabPress(new KeyboardEvent('keydown', { key: 'Tab' }) as never, accept);
    expect(accept).toHaveBeenCalledTimes(1);
  });

  it('runs once when a menu item and the window listener both see the same press', () => {
    const accept = vi.fn();
    const item = document.createElement('button');
    document.body.append(item);
    item.addEventListener('keydown', (evt) => onTabPress(evt as never, accept));
    window.addEventListener('keydown', (evt) => onTabPress(evt as never, accept));

    item.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    );

    expect(accept).toHaveBeenCalledTimes(1);
  });

  it('leaves other keys alone', () => {
    const accept = vi.fn();
    onTabPress(new KeyboardEvent('keydown', { key: 'a' }) as never, accept);
    expect(accept).not.toHaveBeenCalled();
  });
});

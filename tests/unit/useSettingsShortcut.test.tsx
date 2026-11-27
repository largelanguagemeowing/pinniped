// @vitest-environment jsdom
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { createStore, Provider } from 'jotai';
import { afterEach, describe, expect, it } from 'vitest';

import { useSettingsShortcut } from '../../src/app/hooks/useSettingsShortcut';
import { settingsModalAtom } from '../../src/app/state/settingsModal';

// is-hotkey's `mod` is Cmd where the platform is a Mac, Ctrl elsewhere.
const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);

// is-hotkey compares key codes, which a browser sets and jsdom leaves at 0.
const KEY_CODES: Record<string, number> = { ',': 188, k: 75 };

const press = (key: string, extra: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', {
    key,
    keyCode: KEY_CODES[key],
    metaKey: isMac,
    ctrlKey: !isMac,
    cancelable: true,
    ...extra,
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
};

function Harness() {
  useSettingsShortcut();
  return null;
}

let unmount = () => {};
afterEach(() => unmount());

const mount = () => {
  const store = createStore();
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <Provider store={store}>
        <Harness />
      </Provider>
    );
  });
  unmount = () => renderer.unmount();
  return store;
};

describe('useSettingsShortcut', () => {
  it('opens the settings on the platform modifier and a comma, and closes them on the next', () => {
    const store = mount();

    const opened = press(',');
    expect(store.get(settingsModalAtom)).toEqual({});
    expect(opened.defaultPrevented).toBe(true);

    press(',');
    expect(store.get(settingsModalAtom)).toBeUndefined();
  });

  it('leaves other keys and modifier combinations alone', () => {
    const store = mount();

    const plain = press(',', { metaKey: false, ctrlKey: false });
    press('k');
    press(',', { shiftKey: true });

    expect(store.get(settingsModalAtom)).toBeUndefined();
    expect(plain.defaultPrevented).toBe(false);
  });
});

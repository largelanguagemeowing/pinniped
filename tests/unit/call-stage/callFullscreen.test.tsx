// @vitest-environment jsdom
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createStore, Provider } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCallFullscreen } from '../../../src/app/features/call/useCallFullscreen';
import { callFullscreenAtom } from '../../../src/app/state/call';

// jsdom has no Fullscreen API; this one changes the fullscreen element and fires the event.
let fullscreenElement: Element | null = null;
const enter = (element: Element) => {
  fullscreenElement = element;
  document.dispatchEvent(new Event('fullscreenchange'));
};
const exitFullscreen = vi.fn(async () => {
  fullscreenElement = null;
  document.dispatchEvent(new Event('fullscreenchange'));
});
const requestFullscreen = vi.fn(async function request(this: Element) {
  enter(this);
});

beforeEach(() => {
  fullscreenElement = null;
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  });
  document.exitFullscreen = exitFullscreen;
  Element.prototype.requestFullscreen = requestFullscreen;
});
afterEach(() => vi.clearAllMocks());

let current!: ReturnType<typeof useCallFullscreen>;
function Controls() {
  current = useCallFullscreen();
  return null;
}

const mount = () => {
  const store = createStore();
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <Provider store={store}>
        <Controls />
      </Provider>
    );
  });
  return { store, renderer };
};

describe('call fullscreen', () => {
  it('fullscreens the whole document, so popouts portaled to the body still show', async () => {
    const { store } = mount();
    await act(async () => current[1]());
    expect(requestFullscreen.mock.contexts).toEqual([document.documentElement]);
    expect(current[0]).toBe(true);
    expect(store.get(callFullscreenAtom)).toBe(true);

    await act(async () => current[1]());
    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(store.get(callFullscreenAtom)).toBe(false);
  });

  it('follows fullscreen left another way (Escape)', async () => {
    const { store } = mount();
    await act(async () => current[1]());
    await act(async () => document.exitFullscreen());
    expect(store.get(callFullscreenAtom)).toBe(false);
  });

  it('ignores another element going fullscreen', () => {
    const { store } = mount();
    act(() => enter(document.createElement('video')));
    expect(store.get(callFullscreenAtom)).toBe(false);
  });

  it('leaves fullscreen when the call view goes away', async () => {
    const { store, renderer } = mount();
    await act(async () => current[1]());
    act(() => renderer.unmount());
    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(store.get(callFullscreenAtom)).toBe(false);
  });

  it('does not leave fullscreen it does not own', () => {
    const { renderer } = mount();
    act(() => enter(document.createElement('video')));
    act(() => renderer.unmount());
    expect(exitFullscreen).not.toHaveBeenCalled();
  });
});

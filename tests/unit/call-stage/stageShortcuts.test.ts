// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { type FocusEvent, type KeyboardEvent } from 'react';
import { BehaviorSubject } from 'rxjs';

import {
  createStageShortcuts,
  type ShortcutCall,
} from '../../../src/app/features/call/stage/useStageShortcuts';

const fakeCall = (microphoneOn = false) => {
  const setEnabled = vi.fn();
  const call: ShortcutCall = {
    toggleMicrophone: vi.fn(),
    toggleVideo: vi.fn(),
    muteStates: {
      audio: {
        enabled$: new BehaviorSubject(microphoneOn),
        setEnabled$: new BehaviorSubject<typeof setEnabled | null>(setEnabled),
      },
    },
  };
  return { call, setEnabled };
};

const key = (k: string, target: EventTarget, mods: Partial<KeyboardEvent> = {}): KeyboardEvent =>
  ({ key: k, target, preventDefault: vi.fn(), ...mods }) as unknown as KeyboardEvent;

const blur = (root: Element, relatedTarget: Element | null): FocusEvent =>
  ({ currentTarget: root, relatedTarget }) as unknown as FocusEvent;

describe('call view shortcuts', () => {
  const root = document.createElement('div');
  const tile = document.createElement('div');
  const button = document.createElement('button');
  const input = document.createElement('input');
  root.append(tile, button, input);
  const outside = document.createElement('textarea');

  it('m toggles the microphone and v the camera', () => {
    const { call } = fakeCall();
    const shortcuts = createStageShortcuts(call);
    shortcuts.onKeyDown(key('m', tile));
    shortcuts.onKeyDown(key('v', tile));
    expect(call.toggleMicrophone).toHaveBeenCalledTimes(1);
    expect(call.toggleVideo).toHaveBeenCalledTimes(1);
  });

  it('ignores keys typed into a field and keys with modifiers', () => {
    const { call } = fakeCall();
    const shortcuts = createStageShortcuts(call);
    shortcuts.onKeyDown(key('m', input));
    shortcuts.onKeyDown(key('m', tile, { ctrlKey: true }));
    shortcuts.onKeyDown(key('v', tile, { shiftKey: true }));
    expect(call.toggleMicrophone).not.toHaveBeenCalled();
    expect(call.toggleVideo).not.toHaveBeenCalled();
  });

  it('holding space talks: the microphone is on until it is released', () => {
    const { call, setEnabled } = fakeCall();
    const shortcuts = createStageShortcuts(call);
    shortcuts.onKeyDown(key(' ', tile));
    // Key repeat while held does not toggle again.
    shortcuts.onKeyDown(key(' ', tile));
    expect(setEnabled.mock.calls).toEqual([[true]]);
    shortcuts.onKeyUp(key(' ', tile));
    expect(setEnabled.mock.calls).toEqual([[true], [false]]);
  });

  it('keeps a microphone that was already on when space is released', () => {
    const { call, setEnabled } = fakeCall(true);
    const shortcuts = createStageShortcuts(call);
    shortcuts.onKeyDown(key(' ', tile));
    shortcuts.onKeyUp(key(' ', tile));
    expect(setEnabled).not.toHaveBeenLastCalledWith(false);
  });

  it('leaves space to a focused button', () => {
    const { call, setEnabled } = fakeCall();
    const shortcuts = createStageShortcuts(call);
    shortcuts.onKeyDown(key(' ', button));
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it('ends push to talk when focus leaves the call view, not when it moves inside', () => {
    const { call, setEnabled } = fakeCall();
    const shortcuts = createStageShortcuts(call);
    shortcuts.onKeyDown(key(' ', tile));
    shortcuts.onBlur(blur(root, button));
    expect(setEnabled.mock.calls).toEqual([[true]]);
    shortcuts.onBlur(blur(root, outside));
    expect(setEnabled.mock.calls).toEqual([[true], [false]]);
    // Nothing held any more: a later blur changes nothing.
    shortcuts.onBlur(blur(root, null));
    expect(setEnabled.mock.calls).toEqual([[true], [false]]);
  });
});

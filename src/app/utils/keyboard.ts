import { isKeyHotkey } from 'is-hotkey';
import { KeyboardEventHandler } from 'react';

export interface KeyboardEventLike {
  key: string;
  which: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  /** Whether a handler that ran earlier already took this key press. */
  defaultPrevented?: boolean;
  preventDefault(): void;
}

/**
 * Runs `callback` on Tab, once per key press: a focused menu item and the window listener of
 * the same menu both see the press, and the first one to take it marks it prevented.
 */
export const onTabPress = (evt: KeyboardEventLike, callback: () => void) => {
  if (isKeyHotkey('tab', evt) && !evt.defaultPrevented) {
    evt.preventDefault();
    callback();
  }
};

export const preventScrollWithArrowKey: KeyboardEventHandler = (evt) => {
  if (isKeyHotkey(['arrowup', 'arrowright', 'arrowdown', 'arrowleft'], evt)) {
    evt.preventDefault();
  }
};

export const onEnterOrSpace =
  <T>(callback: (evt: T) => void) =>
  (evt: KeyboardEventLike) => {
    if (isKeyHotkey('enter', evt) || isKeyHotkey('space', evt)) {
      evt.preventDefault();
      callback(evt as T);
    }
  };

export const stopPropagation = (evt: KeyboardEvent): boolean => {
  const ae = document.activeElement;
  const editableActiveElement = ae
    ? ae.nodeName.toLowerCase() === 'input' ||
      ae.nodeName.toLowerCase() === 'textarea' ||
      ae.getAttribute('contenteditable') === 'true'
    : false;

  if (editableActiveElement) return false;

  evt.stopPropagation();
  return true;
};

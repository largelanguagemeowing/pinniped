import { type FocusEvent, type KeyboardEvent, useMemo } from 'react';

import { type Call } from '../../../plugins/call/Call';

/** Keys typed into a field are text, not shortcuts. */
const isTextEntry = (target: EventTarget): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.closest('input, textarea, select') !== null);

const isButton = (target: EventTarget): boolean =>
  target instanceof HTMLElement && target.closest('button') !== null;

export interface StageShortcutHandlers {
  onKeyDown: (evt: KeyboardEvent) => void;
  onKeyUp: (evt: KeyboardEvent) => void;
  onBlur: (evt: FocusEvent) => void;
}

/** What the shortcuts control. */
export type ShortcutCall = Pick<Call, 'toggleMicrophone' | 'toggleVideo'> & {
  muteStates: { audio: { setEnabled$: Call['muteStates']['audio']['setEnabled$'] } };
};

/**
 * Shortcuts while focus is inside the call view (never globally): m toggles the microphone,
 * v the camera, and holding space talks (the microphone is on while it is held). The handlers
 * go on the call view's root.
 */
export function createStageShortcuts(call: ShortcutCall): StageShortcutHandlers {
  let spaceHeld = false;
  const setMicrophone = (enabled: boolean): void =>
    call.muteStates.audio.setEnabled$.value?.(enabled);
  const releaseSpace = (): void => {
    if (!spaceHeld) return;
    spaceHeld = false;
    setMicrophone(false);
  };

  return {
    onKeyDown: (evt) => {
      if (evt.altKey || evt.ctrlKey || evt.metaKey || evt.shiftKey) return;
      if (isTextEntry(evt.target)) return;
      if (evt.key === 'm') {
        evt.preventDefault();
        call.toggleMicrophone();
      } else if (evt.key === 'v') {
        evt.preventDefault();
        call.toggleVideo();
      } else if (evt.key === ' ' && !isButton(evt.target)) {
        evt.preventDefault();
        if (!spaceHeld) {
          spaceHeld = true;
          setMicrophone(true);
        }
      }
    },
    onKeyUp: (evt) => {
      if (evt.key === ' ') releaseSpace();
    },
    // Focus leaving the call view ends push to talk: its key-up would go elsewhere.
    onBlur: (evt) => {
      if (!(evt.relatedTarget instanceof Node) || !evt.currentTarget.contains(evt.relatedTarget))
        releaseSpace();
    },
  };
}

export const useStageShortcuts = (call: Call): StageShortcutHandlers =>
  useMemo(() => createStageShortcuts(call), [call]);

// Focus rings show only while navigating with Tab; any pointer press hides them again. The mode is
// kept on the root element so styles can select on it (`inputModeSelector`).
export type InputMode = 'keyboard' | 'pointer';

export const INPUT_MODE_ATTRIBUTE = 'data-input-mode';

export const inputModeSelector = (mode: InputMode): string =>
  `:root[${INPUT_MODE_ATTRIBUTE}="${mode}"]`;

// Tab and Shift+Tab move focus; with Ctrl, Alt or Meta, Tab is a shortcut.
const isFocusNavigation = (evt: KeyboardEvent): boolean =>
  evt.key === 'Tab' && !evt.ctrlKey && !evt.altKey && !evt.metaKey;

export function trackInputMode(doc: Document): () => void {
  const root = doc.documentElement;
  const setMode = (mode: InputMode) => {
    if (root.getAttribute(INPUT_MODE_ATTRIBUTE) !== mode) {
      root.setAttribute(INPUT_MODE_ATTRIBUTE, mode);
    }
  };

  // capture phase; focus traps handle Tab themselves and prevent its default
  const onKeyDown = (evt: KeyboardEvent) => {
    if (isFocusNavigation(evt)) setMode('keyboard');
  };
  const onPointerDown = () => setMode('pointer');

  setMode('pointer');
  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('pointerdown', onPointerDown, true);
  return () => {
    doc.removeEventListener('keydown', onKeyDown, true);
    doc.removeEventListener('pointerdown', onPointerDown, true);
  };
}

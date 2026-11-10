import { color } from 'folds';

/**
 * The call widget scrolls like the rest of Pinniped: its scrollbar is the folds `Scroll` component's
 * (Background variant), so these are the colours that component uses. The widget lives in an iframe
 * and cannot see Pinniped's theme variables, so they are resolved here and written to its document.
 */
const SCROLLBAR_COLORS = {
  '--cinny-scrollbar-track': color.Background.ContainerHover,
  '--cinny-scrollbar-thumb': color.Background.ContainerLine,
} as const;

/** Turns a theme colour (`var(--...)`) into the colour it currently has in this document. */
const resolveColor = (value: string): string => {
  const probe = document.createElement('span');
  probe.style.color = value;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
};

/** Writes the current theme's scrollbar colours into the call widget's document. */
export const applyCallScrollbarColors = (doc: Document | undefined): void => {
  const root = doc?.documentElement;
  if (!root) return;
  Object.entries(SCROLLBAR_COLORS).forEach(([name, value]) => {
    root.style.setProperty(name, resolveColor(value));
  });
};

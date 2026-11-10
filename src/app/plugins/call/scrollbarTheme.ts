import { color } from 'folds';

/**
 * The call widget scrolls like the rest of Pinniped: its scrollbar is the folds `Scroll` component's
 * (Background variant), so these are the colours that component uses. The widget lives in an iframe
 * and cannot see Pinniped's theme variables, so they are resolved here and sent to it.
 */
const SCROLLBAR_COLORS = {
  track: color.Background.ContainerHover,
  thumb: color.Background.ContainerLine,
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

/** The current theme's scrollbar colours, as the call widget takes them. */
export const getCallScrollbarColors = (): { track: string; thumb: string } => ({
  track: resolveColor(SCROLLBAR_COLORS.track),
  thumb: resolveColor(SCROLLBAR_COLORS.thumb),
});

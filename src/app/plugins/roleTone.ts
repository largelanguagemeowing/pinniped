import chroma from 'chroma-js';

/** What a tone is mixed from: the theme's text and background colors (CSS values). */
export type ToneBase = {
  text: string;
  background: string;
  // On dark themes brighter means more text color; on light themes the text color is the dark one.
  strongerWhenBrighter: boolean;
};

/** Share of the text color, in percent, at the faintest tone. */
export const TONE_FLOOR = 70;

/**
 * The tone of a role color: the theme's text color at a strength that follows the role color's
 * brightness (CIE lightness), mixed toward the theme background. Never fainter than TONE_FLOOR.
 */
export const toneOf = (color: string, base: ToneBase): string | undefined => {
  if (!chroma.valid(color)) return undefined;
  const lightness = Math.min(100, Math.max(0, chroma(color).lab()[0]));
  const share = base.strongerWhenBrighter ? lightness / 100 : 1 - lightness / 100;
  const percent = Math.round(TONE_FLOOR + (100 - TONE_FLOOR) * share);
  return `color-mix(in srgb, ${base.text} ${percent}%, ${base.background})`;
};

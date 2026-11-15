import { getRolePalette } from './roleHues';

// Number of `--mx-uc-N` variables that `util/colorMXID` hashes into.
export const USER_COLOR_SLOTS = 8;

/**
 * The theme's own accents for the MXID-derived colors (`--mx-uc-1..8`); undefined when the theme
 * has no accent set, which keeps the shared values from `index.css`. With more accents than slots
 * they are sampled evenly; with fewer they repeat.
 */
export const getUserColors = (themeId: string): string[] | undefined => {
  const hues = getRolePalette(themeId)?.hues;
  if (hues === undefined) return undefined;
  return Array.from(
    { length: USER_COLOR_SLOTS },
    (_, i) => hues[Math.floor((i * hues.length) / USER_COLOR_SLOTS) % hues.length]
  );
};

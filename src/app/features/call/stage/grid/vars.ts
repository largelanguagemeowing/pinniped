/** Custom properties the layouts set inline from their tile maths, and their stylesheets read. */

/** Tile size and gap of the participant grid (grid layout, and under the portrait spotlight). */
export const gridVars = {
  gap: '--call-grid-gap',
  tileWidth: '--call-grid-tile-width',
  tileHeight: '--call-grid-tile-height',
} as const;

/** Tile size of the participant strip under a focused stream. */
export const stripVars = {
  tileWidth: '--call-strip-tile-width',
  tileHeight: '--call-strip-tile-height',
} as const;

export const cssVar = (name: string, fallback?: string): string =>
  fallback === undefined ? `var(${name})` : `var(${name}, ${fallback})`;

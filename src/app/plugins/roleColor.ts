import chroma from 'chroma-js';
import type { RoleColorMode } from '../state/settings';

/** How roles are turned into display colors. */
export type RoleColorDisplay = {
  // Makes a room-set color readable on the theme.
  readable: (color: string) => string;
  // Palette mode: roles that are not a pure color get a theme accent each.
  spread: boolean;
  // Tone mode: a tone of the theme's text color for a role color; undefined for a non-color.
  tone: (color: string) => string | undefined;
};

/** The colors a person means by name when they pick exactly the CSS keyword's value. */
export type PureColor = 'red' | 'green' | 'blue' | 'yellow' | 'cyan' | 'magenta';

// Values of the CSS keywords red, lime and green, blue, yellow, cyan (aqua), magenta (fuchsia).
const PURE_COLORS: Record<string, PureColor> = {
  '#ff0000': 'red',
  '#00ff00': 'green',
  '#008000': 'green',
  '#0000ff': 'blue',
  '#ffff00': 'yellow',
  '#00ffff': 'cyan',
  '#ff00ff': 'magenta',
};

// Exact match after normalizing (so `red`, `lime` and `#F00` count, `#fe0000` and a translucent red do not).
const pureColorOf = (color: string): PureColor | undefined =>
  chroma.valid(color) ? PURE_COLORS[chroma(color).hex()] : undefined;

/** A theme's official accent colors; `named` are those its source calls red, green and so on. */
export type RolePalette = {
  hues: readonly string[];
  named: Partial<Record<PureColor, string>>;
};

/**
 * Maps each power tag color to the color its holders' names are drawn in; a color without an
 * entry is drawn in the default text color.
 * - operator: the room's color, passed through `readable`
 * - palette: the theme's own color for a pure color the theme names; every other role gets one
 *   of its accent colors when `spread` is on and its operator color when off; a theme without
 *   a palette (undefined) shows operator colors
 * - tone: the theme's text color at a strength that follows the role color's brightness
 * - off: none
 */
export const resolveRoleColors = (
  mode: RoleColorMode,
  tagColors: Iterable<string>,
  palette: RolePalette | undefined,
  display: RoleColorDisplay
): Map<string, string> => {
  const colors = new Set(tagColors);
  const resolved = new Map<string, string>();

  if (mode === 'off') return resolved;

  if (mode === 'tone') {
    colors.forEach((color) => {
      const tone = display.tone(color);
      if (tone !== undefined) resolved.set(color, tone);
    });
    return resolved;
  }

  if (mode === 'operator' || palette === undefined) {
    colors.forEach((color) => resolved.set(color, display.readable(color)));
    return resolved;
  }

  const { hues, named } = palette;
  const sorted = [...colors]
    .filter((color) => chroma.valid(color))
    .map((color) => ({ color, value: chroma(color).num() }))
    // Ascending by value so the assignment does not depend on tag order.
    .sort((a, b) => a.value - b.value);

  // Pure colors take the theme's name for them first, so the rest cannot claim that slot.
  const taken = new Set<number>();
  const unnamed = new Set(colors);
  sorted.forEach(({ color }) => {
    const pure = pureColorOf(color);
    const hue = pure === undefined ? undefined : named[pure];
    const slot = hue === undefined ? -1 : hues.indexOf(hue);
    if (slot < 0) return;
    taken.add(slot);
    resolved.set(color, hues[slot]);
    unnamed.delete(color);
  });

  if (!display.spread) {
    unnamed.forEach((color) => resolved.set(color, display.readable(color)));
    return resolved;
  }

  // A taken slot moves on to the next free one, which keeps up to hues.length roles distinct.
  sorted
    .filter(({ color }) => unnamed.has(color))
    .forEach(({ color, value }) => {
      let slot = value % hues.length;
      for (let i = 0; i < hues.length && taken.has(slot); i += 1) {
        slot = (slot + 1) % hues.length;
      }
      taken.add(slot);
      resolved.set(color, hues[slot]);
    });
  return resolved;
};

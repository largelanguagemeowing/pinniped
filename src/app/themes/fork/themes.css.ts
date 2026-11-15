import { createTheme, globalStyle } from '@vanilla-extract/css';
import { color } from 'folds';
import { onDarkFontWeight } from '../../../config.css';
import { deriveColorData } from './derive';
import { darkVariablesClass } from './darkVariables';
import { forkThemeRegistry } from './registry';
import { getUserColors } from './userColors';

// Doubled class beats `.on-dark-variables` (same sheet order is not guaranteed) in index.css.
forkThemeRegistry.forEach(({ id }) => {
  const colors = getUserColors(id);
  if (colors === undefined) return;
  globalStyle(`.${id}.${darkVariablesClass}`, {
    vars: Object.fromEntries(colors.map((c, i) => [`--mx-uc-${i + 1}`, c])),
  });
});

/**
 * Vanilla Extract theme class per registry entry, created in registry order.
 * Every dark theme carries the kind marker, its token class, the dark font
 * weight theme, the shared Prism palette, and the shared dark body variables.
 */
export const forkThemes = forkThemeRegistry.map((entry) => ({
  id: entry.id,
  name: entry.name,
  classNames: [
    entry.id,
    createTheme(color, deriveColorData(entry.palette)),
    onDarkFontWeight,
    'prism-dark',
    darkVariablesClass,
  ],
}));

import { describe, expect, it } from 'vitest';
import { forkThemeRegistry } from '../../src/app/themes/fork/registry';
import { getRolePalette } from '../../src/app/themes/fork/roleHues';
import { getUserColors, USER_COLOR_SLOTS } from '../../src/app/themes/fork/userColors';

describe('user colors per theme', () => {
  it('keeps the shared colors for themes without an accent set', () => {
    ['catthode', 'cool-cowboy', 'sequoia-monochrome', 'dark-theme'].forEach((id) =>
      expect(getUserColors(id), id).toBeUndefined()
    );
  });

  it('fills every slot from the theme accents', () => {
    forkThemeRegistry.forEach(({ id }) => {
      const hues = getRolePalette(id)?.hues;
      const colors = getUserColors(id);
      expect(colors === undefined, id).toBe(hues === undefined);
      if (!hues || !colors) return;
      expect(colors).toHaveLength(USER_COLOR_SLOTS);
      colors.forEach((c) => expect(hues, id).toContain(c));
      // every slot differs when the theme has enough accents
      if (hues.length >= USER_COLOR_SLOTS) expect(new Set(colors).size, id).toBe(USER_COLOR_SLOTS);
    });
  });
});

import { describe, expect, it } from 'vitest';
import chroma from 'chroma-js';
import { forkThemeRegistry } from '../../src/app/themes/fork/registry';
import { getRolePalette, ROLE_HUE_MIN_CONTRAST } from '../../src/app/themes/fork/roleHues';

// Themes with no official accent set, or whose design is monochrome or custom.
const withoutSet = ['oled-midnight', 'catthode', 'cool-cowboy', 'sequoia-monochrome'];

describe('role hues per theme', () => {
  it('refuses themes without an official accent set', () => {
    withoutSet.forEach((id) => expect(getRolePalette(id)).toBeUndefined());
    ['light-theme', 'silver-theme', 'dark-theme', 'butter-theme'].forEach((id) =>
      expect(getRolePalette(id)).toBeUndefined()
    );
  });

  it('has a set for every other fork theme', () => {
    forkThemeRegistry
      .filter(({ id }) => !withoutSet.includes(id))
      .forEach(({ id }) => expect(getRolePalette(id), id).toBeDefined());
  });

  it('only offers names readable on the theme background', () => {
    forkThemeRegistry.forEach(({ id, palette }) => {
      getRolePalette(id)?.hues.forEach((hue) =>
        expect(chroma.contrast(hue, palette.bg0), `${id} ${hue}`).toBeGreaterThanOrEqual(
          ROLE_HUE_MIN_CONTRAST
        )
      );
    });
  });

  it('offers enough distinct colors to tell roles apart', () => {
    forkThemeRegistry.forEach(({ id }) => {
      const palette = getRolePalette(id);
      if (palette) expect(new Set(palette.hues).size, id).toBeGreaterThanOrEqual(3);
    });
  });

  it('only names colors the theme offers, one name per color', () => {
    forkThemeRegistry.forEach(({ id }) => {
      const palette = getRolePalette(id);
      if (!palette) return;
      const names = Object.values(palette.named);
      names.forEach((hue) => expect(palette.hues, id).toContain(hue));
      expect(new Set(names).size, id).toBe(names.length);
    });
  });
});

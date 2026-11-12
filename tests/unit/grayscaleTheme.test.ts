import { describe, expect, it } from 'vitest';
import chroma from 'chroma-js';
import { forkThemeRegistry, isGrayscaleTheme } from '../../src/app/themes/fork/registry';

describe('grayscale themes', () => {
  it('flags a theme that has no hues of its own', () => {
    expect(isGrayscaleTheme('sequoia-monochrome')).toBe(true);
  });

  it('does not flag themes with hues, built-ins or unknown ids', () => {
    ['dracula', 'color-fatigue-dark', 'light-theme', 'dark-theme', 'nope'].forEach((id) =>
      expect(isGrayscaleTheme(id), id).toBe(false)
    );
  });

  it('only flags themes whose accents are nearly neutral', () => {
    forkThemeRegistry
      .filter(({ palette }) => palette.grayscale)
      .forEach(({ id, palette }) => {
        [palette.accent, palette.green, palette.yellow, palette.red].forEach((accent) =>
          expect(chroma(accent).hsl()[1], `${id} ${accent}`).toBeLessThanOrEqual(0.2)
        );
      });
  });
});

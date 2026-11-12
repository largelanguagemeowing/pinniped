import { describe, expect, it } from 'vitest';
import chroma from 'chroma-js';
import { toneOf, TONE_FLOOR, ToneBase } from '../../src/app/plugins/roleTone';
import { forkThemeRegistry } from '../../src/app/themes/fork/registry';

const dark: ToneBase = { text: 'T', background: 'B', strongerWhenBrighter: true };
const light: ToneBase = { ...dark, strongerWhenBrighter: false };
const percentOf = (tone: string | undefined) => Number(/ (\d+)%,/.exec(tone ?? '')?.[1]);

describe('role tones', () => {
  it('are stronger for brighter colors on dark themes and weaker on light ones', () => {
    expect(percentOf(toneOf('#ffffff', dark))).toBe(100);
    expect(percentOf(toneOf('#000000', dark))).toBe(TONE_FLOOR);
    expect(percentOf(toneOf('#ffffff', light))).toBe(TONE_FLOOR);
    expect(percentOf(toneOf('#000000', light))).toBe(100);
  });

  it('keep brightness order', () => {
    const grays = ['#222222', '#666666', '#aaaaaa', '#eeeeee'];
    const percents = grays.map((gray) => percentOf(toneOf(gray, dark)));
    expect([...percents].sort((a, b) => a - b)).toEqual(percents);
  });

  it('refuse values that are not colors', () => {
    expect(toneOf('not a color', dark)).toBeUndefined();
  });

  it('stay readable at the faintest tone on every dark fork theme', () => {
    forkThemeRegistry.forEach(({ id, palette }) => {
      const faintest = chroma.mix(palette.bg0, palette.fg, TONE_FLOOR / 100, 'rgb');
      expect(chroma.contrast(faintest, palette.bg0), id).toBeGreaterThanOrEqual(3);
    });
  });
});

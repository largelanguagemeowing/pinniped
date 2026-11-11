import { describe, expect, it } from 'vitest';
import { contrastRatio, deriveColorData } from '../../src/app/themes/fork/derive';
import { forkThemeRegistry } from '../../src/app/themes/fork/registry';

const HEX = /^#[0-9a-fA-F]{6}$/;
const RGBA = /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)$/;

const paletteOf = (themeId: string) => {
  const entry = forkThemeRegistry.find((candidate) => candidate.id === themeId);
  if (!entry) throw new Error(`missing palette: ${themeId}`);
  return entry.palette;
};

const colorGroups = (themeId: string) => deriveColorData(paletteOf(themeId));

const SURFACE_GROUPS = ['Background', 'Surface', 'SurfaceVariant'] as const;
const ACCENT_GROUPS = ['Primary', 'Secondary', 'Success', 'Warning', 'Critical'] as const;
const COLORED_GROUPS = [...SURFACE_GROUPS, ...ACCENT_GROUPS] as const;

const groupKeys = [
  'Container',
  'ContainerHover',
  'ContainerActive',
  'ContainerLine',
  'OnContainer',
];
const accentKeys = [
  'Main',
  'MainHover',
  'MainActive',
  'MainLine',
  'OnMain',
  'Container',
  'ContainerHover',
  'ContainerActive',
  'ContainerLine',
  'OnContainer',
];

describe('fork theme palettes', () => {
  it('defines the complete Folds token contract for every theme', () => {
    forkThemeRegistry.forEach(({ id }) => {
      const data = colorGroups(id);
      expect(Object.keys(data).sort()).toEqual(
        [
          'Background',
          'Critical',
          'Other',
          'Primary',
          'Secondary',
          'Success',
          'Surface',
          'SurfaceVariant',
          'Warning',
        ].sort()
      );
      SURFACE_GROUPS.forEach((group) => {
        expect(Object.keys(data[group]).sort()).toEqual([...groupKeys].sort());
      });
      ACCENT_GROUPS.forEach((group) => {
        expect(Object.keys(data[group]).sort()).toEqual([...accentKeys].sort());
      });
      expect(Object.keys(data.Other).sort()).toEqual(['FocusRing', 'Overlay', 'Shadow'].sort());
    });
  });

  it('uses valid color values everywhere', () => {
    forkThemeRegistry.forEach(({ id }) => {
      const data = colorGroups(id);
      COLORED_GROUPS.forEach((group) => {
        Object.entries(data[group]).forEach(([key, value]) => {
          expect(value, `${id}.${group}.${key}`).toMatch(HEX);
        });
      });
      Object.entries(data.Other).forEach(([key, value]) => {
        expect(value, `${id}.Other.${key}`).toMatch(RGBA);
      });
    });
  });

  it.each(forkThemeRegistry)(
    '$id keeps text at AA contrast in every interaction state',
    ({ palette }) => {
      const data = deriveColorData(palette);
      COLORED_GROUPS.forEach((group) => {
        const tokens = data[group];
        (['Container', 'ContainerHover', 'ContainerActive'] as const).forEach((state) => {
          expect(
            contrastRatio(tokens.OnContainer, tokens[state]),
            `${group}.${state}`
          ).toBeGreaterThanOrEqual(4.5);
        });
      });
      ACCENT_GROUPS.forEach((group) => {
        const tokens = data[group];
        (['Main', 'MainHover', 'MainActive'] as const).forEach((state) => {
          expect(
            contrastRatio(tokens.OnMain, tokens[state]),
            `${group}.${state}`
          ).toBeGreaterThanOrEqual(4.5);
        });
      });
    }
  );

  it.each(['#000000', '#ffffff', '#767676', '#747474', '#ff0000', '#00ff00', '#0000ff'])(
    'keeps boundary accent %s readable',
    (accent) => {
      const { Primary } = deriveColorData({ ...paletteOf('nord'), bg0: '#000000', accent });
      (['Main', 'MainHover', 'MainActive'] as const).forEach((state) => {
        expect(contrastRatio(Primary.OnMain, Primary[state]), state).toBeGreaterThanOrEqual(4.5);
      });
    }
  );

  it('rejects container ramps without a shared AA foreground', () => {
    expect(() => deriveColorData({ ...paletteOf('nord'), accent: '#ffffff' })).toThrow(
      'No AA text color'
    );
  });

  it('keeps every grayscale accent readable through the light/dark text boundary', () => {
    Array.from({ length: 256 }, (_, value) => value.toString(16).padStart(2, '0')).forEach(
      (hex) => {
        const accent = `#${hex.repeat(3)}`;
        const { Primary } = deriveColorData({ ...paletteOf('nord'), bg0: '#000000', accent });
        (['Main', 'MainHover', 'MainActive'] as const).forEach((state) => {
          expect(
            contrastRatio(Primary.OnMain, Primary[state]),
            `${accent}.${state}`
          ).toBeGreaterThanOrEqual(4.5);
        });
      }
    );
  });

  it('lifts a dim foreground into a readable neutral ramp', () => {
    const { Background, Secondary } = deriveColorData({
      ...paletteOf('nord'),
      bg0: '#0F1014',
      bg1: '#111216',
      bg2: '#131317',
      fg: '#868690',
    });
    expect(Secondary.Main).toBe(Background.OnContainer);
    (['Main', 'MainHover', 'MainActive'] as const).forEach((state) => {
      expect(contrastRatio(Secondary.OnMain, Secondary[state]), state).toBeGreaterThanOrEqual(4.5);
    });
  });

  it.each(forkThemeRegistry)(
    '$id preserves source colors and distinct interaction states',
    ({ palette }) => {
      const data = deriveColorData(palette);
      expect(data.Background.Container).toBe(palette.bg0);
      expect(data.Surface.Container).toBe(palette.bg1);
      expect(data.Primary.Main).toBe(palette.accent);
      expect(data.Success.Main).toBe(palette.green);
      expect(data.Warning.Main).toBe(palette.orange ?? palette.yellow);
      expect(data.Critical.Main).toBe(palette.red);
      COLORED_GROUPS.forEach((group) => {
        const tokens = data[group];
        expect(
          new Set([tokens.Container, tokens.ContainerHover, tokens.ContainerActive]).size
        ).toBe(3);
      });
      ACCENT_GROUPS.forEach((group) => {
        const tokens = data[group];
        expect(new Set([tokens.Main, tokens.MainHover, tokens.MainActive]).size).toBe(3);
      });
    }
  );

  it('keeps accent controls visible against the background (3:1 non-text)', () => {
    forkThemeRegistry.forEach(({ id }) => {
      const data = colorGroups(id);
      (['Primary', 'Success', 'Warning', 'Critical'] as const).forEach((group) => {
        expect(
          contrastRatio(data[group].Main, data.Background.Container),
          `${id}.${group}.Main`
        ).toBeGreaterThanOrEqual(3);
      });
    });
  });

  it('derives distinct surfaces for each hard/medium/soft and flavor variant', () => {
    const backgroundsOf = (prefix: string) =>
      forkThemeRegistry
        .filter((entry) => entry.id.startsWith(prefix))
        .map((entry) => colorGroups(entry.id).Background.Container);

    (['everforest-dark', 'gruvbox-dark', 'catppuccin', 'tokyo-night'] as const).forEach(
      (prefix) => {
        const backgrounds = backgroundsOf(prefix);
        expect(new Set(backgrounds).size).toBe(backgrounds.length);
      }
    );
  });

  it('keeps success, warning, and critical visually distinct from primary', () => {
    forkThemeRegistry.forEach(({ id }) => {
      const data = colorGroups(id);
      const mains = [data.Primary.Main, data.Success.Main, data.Warning.Main, data.Critical.Main];
      expect(new Set(mains).size).toBe(mains.length);
    });
  });

  it('focus ring, shadow, and overlay match the built-in dark behavior', () => {
    forkThemeRegistry.forEach(({ id }) => {
      expect(colorGroups(id).Other).toEqual({
        FocusRing: 'rgba(255, 255, 255, 0.5)',
        Shadow: 'rgba(0, 0, 0, 1)',
        Overlay: 'rgba(0, 0, 0, 0.8)',
      });
    });
  });
});

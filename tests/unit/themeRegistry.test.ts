import { describe, expect, it, vi } from 'vitest';
import { forkThemes } from '../../src/app/themes/fork';
import {
  allThemes,
  DarkTheme,
  LightTheme,
  SilverTheme,
  ButterTheme,
  resolveActiveTheme,
  themeDisplayNames,
} from '../../src/app/hooks/useTheme';

// settings.ts reads localStorage at module load; Vitest runs in plain Node.
vi.hoisted(() => {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  } as Storage;
});

// Vanilla Extract is a build-time compiler; stub it so hook modules (which
// import .css.ts files) can be evaluated in the plain Node test environment.
vi.mock('@vanilla-extract/css', () => {
  let counter = 0;
  return {
    createTheme: () => {
      counter += 1;
      return `ve-theme-${counter}`;
    },
  };
});

const BUILTIN_IDS = ['light-theme', 'silver-theme', 'dark-theme', 'butter-theme'];

const REQUESTED_IDS = [
  'ayu-dark',
  'ayu-mirage',
  'catppuccin-frappe',
  'catppuccin-macchiato',
  'catppuccin-mocha',
  'dracula',
  'everforest-dark-hard',
  'everforest-dark-medium',
  'everforest-dark-soft',
  'gruvbox-dark-hard',
  'gruvbox-dark-medium',
  'gruvbox-dark-soft',
  'kanagawa-dragon',
  'kanagawa-wave',
  'nord',
  'rose-pine',
  'rose-pine-moon',
  'tokyo-night-moon',
  'tokyo-night-night',
  'tokyo-night-storm',
  'oled-midnight',
  'catthode',
  'color-fatigue-dark',
  'cool-cowboy',
  'kanso-ink',
  'sequoia-monochrome',
];

const REQUESTED_NAMES: Record<string, string> = {
  'ayu-dark': 'Ayu Dark',
  'ayu-mirage': 'Ayu Mirage',
  'catppuccin-frappe': 'Catppuccin Frappé',
  'catppuccin-macchiato': 'Catppuccin Macchiato',
  'catppuccin-mocha': 'Catppuccin Mocha',
  dracula: 'Dracula',
  'everforest-dark-hard': 'Everforest Dark Hard',
  'everforest-dark-medium': 'Everforest Dark Medium',
  'everforest-dark-soft': 'Everforest Dark Soft',
  'gruvbox-dark-hard': 'Gruvbox Dark Hard',
  'gruvbox-dark-medium': 'Gruvbox Dark Medium',
  'gruvbox-dark-soft': 'Gruvbox Dark Soft',
  'kanagawa-dragon': 'Kanagawa Dragon',
  'kanagawa-wave': 'Kanagawa Wave',
  nord: 'Nord',
  'oled-midnight': 'OLED Midnight',
  catthode: 'Catthode',
  'rose-pine': 'Rosé Pine',
  'rose-pine-moon': 'Rosé Pine Moon',
  'tokyo-night-moon': 'Tokyo Night Moon',
  'tokyo-night-night': 'Tokyo Night Night',
  'tokyo-night-storm': 'Tokyo Night Storm',
  'color-fatigue-dark': 'Color Fatigue Dark',
  'cool-cowboy': 'Cool Cowboy',
  'kanso-ink': 'Kanso Ink',
  'sequoia-monochrome': 'Sequoia Monochrome',
};

const themes = allThemes;

describe('theme registry', () => {
  it('keeps the four built-in IDs, in order', () => {
    expect(themes.slice(0, 4).map((theme) => theme.id)).toEqual(BUILTIN_IDS);
  });

  it('contains exactly the requested 26 fork themes after the built-ins, in order', () => {
    expect(themes.map((theme) => theme.id)).toEqual([...BUILTIN_IDS, ...REQUESTED_IDS]);
  });

  it('has 30 unique themes: 2 light and 28 dark', () => {
    expect(themes).toHaveLength(30);
    expect(new Set(themes.map((theme) => theme.id)).size).toBe(30);
    expect(themes.filter((theme) => theme.kind === 'light')).toHaveLength(2);
    expect(themes.filter((theme) => theme.kind === 'dark')).toHaveLength(28);
  });

  it('names every theme from one metadata source', () => {
    expect(forkThemes.map((forkTheme) => forkTheme.id)).toEqual(REQUESTED_IDS);
    forkThemes.forEach((forkTheme) => {
      expect(forkTheme.name).toBe(REQUESTED_NAMES[forkTheme.id]);
      expect(themeDisplayNames[forkTheme.id]).toBe(forkTheme.name);
    });
  });

  it('gives every dark theme the required classes', () => {
    themes
      .filter((entry) => entry.kind === 'dark')
      .forEach((entry) => {
        expect(entry.classNames[0]).toBe(entry.id);
        expect(entry.classNames).toContain('prism-dark');
        expect(entry.classNames).toContain('on-dark-variables');
        // token class (createTheme) and dark font weight class must be present
        expect(entry.classNames.some((className) => className.startsWith('ve-theme-'))).toBe(true);
        expect(new Set(entry.classNames).size).toBe(entry.classNames.length);
      });
    expect(DarkTheme.classNames).toContain('prism-dark');
    expect(ButterTheme.classNames).toContain('prism-dark');
  });

  it('keeps light themes on prism-light', () => {
    expect(LightTheme.classNames).toContain('prism-light');
    expect(SilverTheme.classNames).toContain('prism-light');
  });

  it('gives every fork theme a unique token class', () => {
    const tokenClasses = forkThemes.map((theme) => theme.classNames[1]);
    expect(new Set(tokenClasses).size).toBe(tokenClasses.length);
  });
});

describe('resolveActiveTheme', () => {
  const themeById = (id: string) => {
    const found = themes.find((entry) => entry.id === id);
    if (!found) throw new Error(`missing theme: ${id}`);
    return found;
  };

  const input = (overrides: Partial<Parameters<typeof resolveActiveTheme>[0]>) => ({
    useSystemTheme: false,
    systemThemeKind: 'light' as const,
    themes,
    ...overrides,
  });

  it('picks any theme manually with a Light fallback for unknown IDs', () => {
    const nord = themeById('nord');
    expect(resolveActiveTheme(input({ themeId: 'nord' }))).toBe(nord);
    expect(resolveActiveTheme(input({ themeId: 'unknown-theme' }))).toBe(LightTheme);
    expect(resolveActiveTheme(input({}))).toBe(LightTheme);
  });

  it('picks the dark preference while the OS prefers dark', () => {
    const mocha = themeById('catppuccin-mocha');
    expect(
      resolveActiveTheme(
        input({ useSystemTheme: true, systemThemeKind: 'dark', darkThemeId: mocha.id })
      )
    ).toBe(mocha);
  });

  it('falls back to Dark when the saved dark preference is missing or unknown', () => {
    expect(resolveActiveTheme(input({ useSystemTheme: true, systemThemeKind: 'dark' }))).toBe(
      DarkTheme
    );
    expect(
      resolveActiveTheme(
        input({ useSystemTheme: true, systemThemeKind: 'dark', darkThemeId: 'gone' })
      )
    ).toBe(DarkTheme);
  });

  it('picks the light preference and falls back to Light while the OS prefers light', () => {
    expect(resolveActiveTheme(input({ useSystemTheme: true, systemThemeKind: 'light' }))).toBe(
      LightTheme
    );
    expect(
      resolveActiveTheme(
        input({ useSystemTheme: true, systemThemeKind: 'light', lightThemeId: 'gone' })
      )
    ).toBe(LightTheme);
  });

  it('keeps dark-kind selection independent of the light preference and vice versa', () => {
    const moon = themeById('tokyo-night-moon');
    // A stale manual ID does not leak into system mode
    expect(
      resolveActiveTheme(
        input({
          useSystemTheme: true,
          systemThemeKind: 'dark',
          themeId: moon.id,
          darkThemeId: undefined,
        })
      )
    ).toBe(DarkTheme);
    // The inactive preference does not affect the active kind
    expect(
      resolveActiveTheme(
        input({
          useSystemTheme: true,
          systemThemeKind: 'dark',
          lightThemeId: 'nord',
          darkThemeId: 'tokyo-night-moon',
        })
      )
    ).toBe(moon);
  });
});

import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Provider, createStore } from 'jotai';
import { configClass, lightTheme, varsClass } from 'folds';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSettings, settingsAtom, Settings } from '../../src/app/state/settings';
import { AuthRouteThemeManager, UnAuthRouteThemeManager } from '../../src/app/pages/ThemeManager';
import { useTheme } from '../../src/app/hooks/useTheme';
import { useSetting } from '../../src/app/state/hooks/settings';

// settings.ts touches localStorage at import time and ThemeManager mutates
// document.body; Vitest runs in plain Node, so stub both.
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

  const bodyClasses = new Set<string>();
  const body = {
    style: {} as Record<string, string>,
    classList: {
      add: (...tokens: string[]) => {
        tokens.forEach((token) => bodyClasses.add(token));
      },
      remove: (...tokens: string[]) => {
        tokens.forEach((token) => bodyClasses.delete(token));
      },
    },
  };
  Object.defineProperty(body, 'className', {
    get: () => [...bodyClasses].join(' '),
    set: (value: string) => {
      if (value === '') bodyClasses.clear();
    },
  });
  (globalThis as Record<string, unknown>).document = { body };
  (globalThis as Record<string, unknown>).window = {
    matchMedia: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  };
});

// Vanilla Extract is a build-time compiler; stub it so .css.ts imports work in Node.
vi.mock('@vanilla-extract/css', () => {
  let counter = 0;
  return {
    createTheme: () => {
      counter += 1;
      return `ve-theme-${counter}`;
    },
    style: () => {
      counter += 1;
      return `ve-style-${counter}`;
    },
    globalStyle: () => {},
  };
});

const bodyClasses = (): string[] => document.body.className.split(' ').filter(Boolean);

const makeStore = (settings: Partial<Settings>) => {
  const store = createStore();
  store.set(settingsAtom, { ...getSettings(), ...settings });
  return store;
};

const render = (store: ReturnType<typeof makeStore>, node: React.ReactNode) => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Provider store={store}>{node}</Provider>);
  });
  return renderer;
};

describe('AuthRouteThemeManager', () => {
  beforeEach(() => {
    document.body.className = '';
    document.body.style.filter = '';
  });

  it('applies base classes and the built-in dark theme classes', () => {
    const store = makeStore({ useSystemTheme: false, themeId: 'dark-theme' });
    render(store, <AuthRouteThemeManager>probe</AuthRouteThemeManager>);

    const classes = bodyClasses();
    expect(classes).toContain(configClass);
    expect(classes).toContain(varsClass);
    expect(classes).toContain('dark-theme');
    expect(classes).toContain('prism-dark');
    expect(classes).toContain('on-dark-variables');
  });

  it('applies fork theme classes including the shared dark variables class', () => {
    const store = makeStore({ useSystemTheme: false, themeId: 'nord' });
    render(store, <AuthRouteThemeManager>probe</AuthRouteThemeManager>);

    const classes = bodyClasses();
    expect(classes).toContain('nord');
    expect(classes).toContain('on-dark-variables');
    expect(classes).toContain('prism-dark');
    expect(classes).not.toContain('dark-theme');
  });

  it('replaces previous theme classes on switch and updates the context', () => {
    const store = makeStore({ useSystemTheme: false, themeId: 'nord' });

    let activeId = '';
    function Probe() {
      activeId = useTheme().id;
      return null;
    }

    const renderer = render(
      store,
      <AuthRouteThemeManager>
        <Probe />
      </AuthRouteThemeManager>
    );
    expect(activeId).toBe('nord');

    act(() => {
      store.set(settingsAtom, {
        ...getSettings(),
        useSystemTheme: false,
        themeId: 'gruvbox-dark-soft',
      });
    });
    expect(activeId).toBe('gruvbox-dark-soft');

    const classes = bodyClasses();
    expect(classes).toContain('gruvbox-dark-soft');
    expect(classes).not.toContain('nord');
    expect(classes).not.toContain('ve-theme-6');
    renderer.unmount();
  });

  it('keeps monochrome and low-animation options working', () => {
    const store = makeStore({ useSystemTheme: false, themeId: 'nord' });
    let renderer = render(store, <AuthRouteThemeManager>probe</AuthRouteThemeManager>);

    act(() => {
      store.set(settingsAtom, {
        ...getSettings(),
        useSystemTheme: false,
        themeId: 'nord',
        monochromeMode: true,
        lowAnimationMode: true,
      });
    });
    expect(bodyClasses()).toContain('low-animation-mode');
    expect(document.body.style.filter).toBe('grayscale(1)');
    renderer.unmount();

    store.set(settingsAtom, {
      ...getSettings(),
      useSystemTheme: false,
      themeId: 'nord',
      monochromeMode: false,
      lowAnimationMode: false,
    });
    renderer = render(store, <AuthRouteThemeManager>probe</AuthRouteThemeManager>);
    expect(bodyClasses()).not.toContain('low-animation-mode');
    expect(document.body.style.filter).toBe('');
    renderer.unmount();
  });

  it('updates body classes when the OS preference selects the other saved theme', () => {
    const store = makeStore({
      useSystemTheme: true,
      lightThemeId: 'silver-theme',
      darkThemeId: 'tokyo-night-storm',
    });
    render(store, <AuthRouteThemeManager>probe</AuthRouteThemeManager>);

    // matchMedia stub reports light; the light preference must apply
    expect(bodyClasses()).toContain('silver-theme');
    expect(bodyClasses()).toContain('prism-light');
    expect(bodyClasses()).not.toContain('tokyo-night-storm');
  });
});

describe('UnAuthRouteThemeManager', () => {
  it('stays on the system-selected base theme and ignores stored selections', () => {
    const store = makeStore({ useSystemTheme: false, themeId: 'nord' });
    render(store, <UnAuthRouteThemeManager />);

    const classes = bodyClasses();
    // matchMedia stub reports light: base Light theme only
    expect(classes).toContain(lightTheme);
    expect(classes).toContain('prism-light');
    expect(classes).not.toContain('nord');
    expect(classes).not.toContain('on-dark-variables');
  });
});

describe('theme setting persistence', () => {
  it('stores only the changed field and keeps unrelated settings', () => {
    const store = makeStore({ useSystemTheme: false, themeId: 'nord', pageZoom: 150 });

    function SettingProbe() {
      const [, setThemeId] = useSetting(settingsAtom, 'themeId');
      return (
        <button onClick={() => setThemeId('dracula')} type="button">
          select
        </button>
      );
    }
    const renderer = render(store, <SettingProbe />);

    act(() => {
      renderer.root.findByType('button').props.onClick();
    });

    const stored = JSON.parse(localStorage.getItem('settings') ?? '{}') as Settings;
    expect(stored.themeId).toBe('dracula');
    expect(stored.pageZoom).toBe(150);
    expect(stored.useSystemTheme).toBe(false);
    expect(stored.hideActivity).toBe(false);
  });

  it('restores the stored selection after a reload (fresh module state)', async () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({ ...getSettings(), themeId: 'catppuccin-mocha' })
    );
    vi.resetModules();
    const { settingsAtom: freshAtom } = await import('../../src/app/state/settings');
    const store = createStore();
    expect(store.get(freshAtom).themeId).toBe('catppuccin-mocha');
  });
});

import React, { act } from 'react';
import { create, ReactTestRenderer } from 'react-test-renderer';
import { Badge, color } from 'folds';
import chroma from 'chroma-js';
import { describe, expect, it, vi } from 'vitest';
import { PresenceBadge } from '../../src/app/components/presence/Presence';
import { Presence } from '../../src/app/hooks/useUserPresence';

vi.mock('../../src/app/components/presence/styles.css', () => ({}));
let themeId = 'dracula';
vi.mock('../../src/app/hooks/useTheme', () => ({ useTheme: () => ({ id: themeId }) }));
vi.mock('folds', async (importOriginal) => ({
  ...(await importOriginal<typeof import('folds')>()),
  TooltipProvider: ({ children }: { children: (ref: undefined) => React.ReactNode }) =>
    children(undefined),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const render = async (presence: Presence): Promise<ReactTestRenderer> => {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(<PresenceBadge presence={presence} />);
  });
  return renderer as ReactTestRenderer;
};

describe('presence badge colors', () => {
  it('uses a theme-independent green for online presence', async () => {
    const renderer = await render(Presence.Online);
    const badge = renderer.root.findByType(Badge);
    const background = badge.props.style?.backgroundColor;
    expect(background).toMatch(/^#[0-9a-f]{6}$/i);
    const [red, green, blue] = chroma(background).rgb();
    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);
    renderer.unmount();
  });

  it('takes the theme success color on a grayscale theme', async () => {
    themeId = 'sequoia-monochrome';
    const renderer = await render(Presence.Online);
    expect(renderer.root.findByType(Badge).props.style?.backgroundColor).toBe(color.Success.Main);
    renderer.unmount();
    themeId = 'dracula';
  });

  it('draws away as a crescent so it differs by shape, not only color', async () => {
    const renderer = await render(Presence.Unavailable);
    const badge = renderer.root.findByType(Badge);
    expect(badge.props.style?.backgroundColor).toBe('transparent');
    expect(renderer.root.findAllByType('svg')).toHaveLength(1);
    renderer.unmount();
  });

  it('keeps online and offline as plain badges', async () => {
    for (const presence of [Presence.Online, Presence.Offline]) {
      const renderer = await render(presence);
      expect(renderer.root.findAllByType('svg')).toHaveLength(0);
      renderer.unmount();
    }
  });

  it('preserves themed styling for offline', async () => {
    const renderer = await render(Presence.Offline);
    const badge = renderer.root.findByType(Badge);
    expect(badge.props.style?.backgroundColor).toBeUndefined();
    expect(badge.props.variant).toBe('Secondary');
    expect(badge.props.fill).toBe('Soft');
    renderer.unmount();
  });
});

import { describe, expect, it } from 'vitest';
import { resolveRoleColors, RoleColorDisplay, RolePalette } from '../../src/app/plugins/roleColor';

const hues = ['p0', 'p1', 'p2', 'p3'];
const palette: RolePalette = { hues, named: {} };
const named: RolePalette = { hues, named: { red: 'p2', green: 'p0' } };
// Stands in for the theme-aware lightness adjustment.
const readable = (color: string) => `readable(${color})`;
const display: RoleColorDisplay = {
  readable,
  spread: true,
  tone: (color) => (color === 'not a color' ? undefined : `tone(${color})`),
};
const roles = ['#ff0000', '#00ff00', '#0000ff'];

describe('role colors', () => {
  it('off leaves every role in the default color', () => {
    expect(resolveRoleColors('off', roles, palette, display).size).toBe(0);
  });

  it('operator keeps a color per role, adjusted for readability', () => {
    const resolved = resolveRoleColors('operator', roles, palette, display);
    expect([...resolved.keys()]).toEqual(roles);
    expect(resolved.get('#ff0000')).toBe('readable(#ff0000)');
  });

  it('palette draws only from the theme palette and keeps roles distinct', () => {
    const resolved = resolveRoleColors('palette', roles, palette, display);
    const used = roles.map((role) => resolved.get(role));
    used.forEach((color) => expect(hues).toContain(color));
    expect(new Set(used).size).toBe(roles.length);
  });

  it('palette assignment ignores the order of the roles', () => {
    const forward = resolveRoleColors('palette', roles, palette, display);
    const backward = resolveRoleColors('palette', [...roles].reverse(), palette, display);
    roles.forEach((role) => expect(backward.get(role)).toBe(forward.get(role)));
  });

  it('palette repeats colors only once the palette is used up', () => {
    const many = ['#000000', '#000001', '#000002', '#000003', '#000004'];
    const resolved = resolveRoleColors('palette', many, palette, display);
    expect(new Set(many.map((c) => resolved.get(c))).size).toBe(hues.length);
  });

  it('palette skips values that are not colors', () => {
    expect(resolveRoleColors('palette', ['not a color'], palette, display).size).toBe(0);
  });

  it('palette without a theme palette shows the operator colors', () => {
    const resolved = resolveRoleColors('palette', roles, undefined, display);
    expect([...resolved.entries()]).toEqual(roles.map((role) => [role, readable(role)]));
  });
});

describe('pure colors', () => {
  it('map to the theme color its source names for them', () => {
    const resolved = resolveRoleColors('palette', roles, named, display);
    expect(resolved.get('#ff0000')).toBe('p2');
    expect(resolved.get('#00ff00')).toBe('p0');
  });

  it('count in any spelling of the exact value', () => {
    ['red', '#F00', 'rgb(255, 0, 0)'].forEach((spelling) =>
      expect(resolveRoleColors('palette', [spelling], named, display).get(spelling)).toBe('p2')
    );
  });

  it('include the CSS keywords for them', () => {
    // green is #008000, lime is #00ff00; both mean green.
    ['green', 'lime'].forEach((keyword) =>
      expect(resolveRoleColors('palette', [keyword], named, display).get(keyword)).toBe('p0')
    );
    ['blue', 'yellow', 'cyan', 'aqua', 'magenta', 'fuchsia'].forEach((keyword) => {
      const full: RolePalette = {
        hues,
        named: { blue: 'p1', yellow: 'p1', cyan: 'p1', magenta: 'p1' },
      };
      expect(resolveRoleColors('palette', [keyword], full, display).get(keyword)).toBe('p1');
    });
  });

  it('do not include near misses or translucent values', () => {
    // Their own slots (value % 4) are not red's named p2, so landing there would mean a match.
    ['#fe0000', '#ff0001', 'rgba(255, 0, 0, 0.5)', '#800000'].forEach((color) =>
      expect(resolveRoleColors('palette', [color], named, display).get(color), color).not.toBe('p2')
    );
  });

  it('fall back to the accent set when the theme has no name for them', () => {
    const resolved = resolveRoleColors('palette', ['#0000ff'], named, display);
    expect(hues).toContain(resolved.get('#0000ff'));
  });

  it('keep other roles off the slot they took', () => {
    // #000000 is value 0, which would take p0 (green's name) if the slot were free.
    const resolved = resolveRoleColors('palette', ['#00ff00', '#000000'], named, display);
    expect(resolved.get('#00ff00')).toBe('p0');
    expect(resolved.get('#000000')).not.toBe('p0');
  });

  it('keeps the other roles as they are when spreading is off', () => {
    const roles2 = ['#ff0000', '#123456'];
    const resolved = resolveRoleColors('palette', roles2, named, { ...display, spread: false });
    expect(resolved.get('#ff0000')).toBe('p2');
    expect(resolved.get('#123456')).toBe('readable(#123456)');
  });
});
describe('tone mode', () => {
  it('draws each role as its tone and skips non-colors', () => {
    const resolved = resolveRoleColors('tone', [...roles, 'not a color'], undefined, display);
    roles.forEach((role) => expect(resolved.get(role)).toBe(`tone(${role})`));
    expect(resolved.has('not a color')).toBe(false);
  });
});

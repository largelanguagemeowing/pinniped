import { describe, expect, it } from 'vitest';
import { sanitizeStateTag } from '../../src/app/utils/powerTagColor';

// Room admins write power tag colours into room state. A colour is later put into
// a style value, so only colours a browser would treat as colours may pass.
describe('power tag colours from room state', () => {
  it('keeps plain colours', () => {
    expect(sanitizeStateTag({ name: 'Mod', color: '#2ecc71' }).color).toBe('#2ecc71');
    expect(sanitizeStateTag({ name: 'Mod', color: 'rebeccapurple' }).color).toBe('rebeccapurple');
    expect(sanitizeStateTag({ name: 'Mod', color: 'rgb(1, 2, 3)' }).color).toBe('rgb(1, 2, 3)');
  });

  it('drops anything that is not a colour', () => {
    // Loads an external resource when used as a background.
    expect(
      sanitizeStateTag({ name: 'Mod', color: 'url(https://example.invalid/x.png)' }).color
    ).toBeUndefined();
    // Overrides other declarations.
    expect(sanitizeStateTag({ name: 'Mod', color: 'red; position: fixed' }).color).toBeUndefined();
    expect(
      sanitizeStateTag({ name: 'Mod', color: 'var(--custom-theme-text-color)' }).color
    ).toBeUndefined();
  });

  it('drops non-string colours', () => {
    expect(sanitizeStateTag({ name: 'Mod', color: 42 as unknown as string }).color).toBeUndefined();
    expect(sanitizeStateTag({ name: 'Mod', color: {} as unknown as string }).color).toBeUndefined();
  });

  it('keeps tags without a colour', () => {
    expect(sanitizeStateTag({ name: 'Mod' })).toEqual({ name: 'Mod' });
  });
});

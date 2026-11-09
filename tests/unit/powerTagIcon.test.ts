import { describe, expect, it } from 'vitest';
import { isPowerTagIconKey } from '../../src/app/utils/powerTagIcon';

describe('power tag icon keys', () => {
  it('accepts mxc URIs and emoji', () => {
    expect(isPowerTagIconKey('mxc://example.org/abc')).toBe(true);
    expect(isPowerTagIconKey('🌻')).toBe(true);
    expect(isPowerTagIconKey('👍🏽')).toBe(true);
  });

  it('rejects anything that would load as an image URL', () => {
    expect(isPowerTagIconKey('https://example.invalid/x.png')).toBe(false);
    expect(isPowerTagIconKey('//example.invalid/x.png')).toBe(false);
    expect(isPowerTagIconKey('javascript:alert(1)')).toBe(false);
    expect(isPowerTagIconKey('🌻 https://example.invalid/x.png')).toBe(false);
  });

  it('rejects missing or non-string keys', () => {
    expect(isPowerTagIconKey(undefined)).toBe(false);
    expect(isPowerTagIconKey(42)).toBe(false);
    expect(isPowerTagIconKey({})).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { isMxcUrl } from '../../src/app/utils/mxc';

describe('isMxcUrl', () => {
  it('accepts mxc://<server>/<mediaId>', () => {
    expect(isMxcUrl('mxc://example.org/abcDEF_-123')).toBe(true);
    expect(isMxcUrl('mxc://example.org:8448/abc')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isMxcUrl('https://example.invalid/x.png')).toBe(false);
    expect(isMxcUrl('mxc://example.org')).toBe(false);
    expect(isMxcUrl('mxc:///abc')).toBe(false);
    expect(isMxcUrl('mxc://example.org/abc?x=1')).toBe(false);
    expect(isMxcUrl('mxc://example.org/abc def')).toBe(false);
    expect(isMxcUrl('🌻')).toBe(false);
    expect(isMxcUrl(undefined)).toBe(false);
    expect(isMxcUrl(42)).toBe(false);
  });
});

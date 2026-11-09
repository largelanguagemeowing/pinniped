import { describe, expect, it } from 'vitest';
import { stripOptionalText, stripUnsafeTextChars } from '../../src/app/utils/sanitize';

describe('stripUnsafeTextChars', () => {
  it('removes a right-to-left override that would reverse the text after it', () => {
    // "abc" preceded by U+202E shows as "cba" in most renderers.
    expect(stripUnsafeTextChars('abc\u202Eabc')).toBe('abcabc');
  });

  it('removes embedding and isolate controls', () => {
    expect(stripUnsafeTextChars('\u202A\u202B\u202C\u202D\u202E')).toBe('');
    expect(stripUnsafeTextChars('\u2066\u2067\u2068\u2069')).toBe('');
  });

  it('removes control characters such as the bell and NUL', () => {
    expect(stripUnsafeTextChars('bell:\u0007 nul:\u0000 del:\u007F')).toBe('bell: nul: del:');
  });

  it('keeps tab, newline and carriage return', () => {
    expect(stripUnsafeTextChars('a\tb\nc\r\nd')).toBe('a\tb\nc\r\nd');
  });

  it('keeps left-to-right and right-to-left marks that right-to-left text needs', () => {
    expect(stripUnsafeTextChars('‎abc‏')).toBe('‎abc‏');
  });

  it('leaves ordinary text, including non-ASCII letters, unchanged', () => {
    expect(stripUnsafeTextChars('abcdef é abc مرحبا 日本語')).toBe('abcdef é abc مرحبا 日本語');
  });
});

describe('stripOptionalText', () => {
  it('passes undefined through and strips text otherwise', () => {
    expect(stripOptionalText(undefined)).toBe(undefined);
    expect(stripOptionalText('Topic\u202E')).toBe('Topic');
  });
});

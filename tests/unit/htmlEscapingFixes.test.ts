import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from '../../src/app/utils/ooye';
import { cell } from '../../src/app/features/call-status/stats/markdown';

describe('decodeHtmlEntities', () => {
  it('decodes each entity once', () => {
    expect(decodeHtmlEntities('a &amp; b &lt;i&gt; &quot;x&quot; &#39;y&#x27;')).toBe(
      'a & b <i> "x" \'y\''
    );
  });

  it('does not decode an escaped entity a second time', () => {
    expect(decodeHtmlEntities('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
    expect(decodeHtmlEntities('&amp;amp;')).toBe('&amp;');
  });
});

describe('report table cell', () => {
  it('keeps a pipe inside its cell', () => {
    expect(cell('a|b')).toBe('a\\|b');
  });

  it('keeps a backslash before a pipe from escaping the escape', () => {
    expect(cell('a\\|b')).toBe('a\\\\\\|b');
    expect(cell('trailing\\')).toBe('trailing\\\\');
  });

  it('flattens newlines', () => {
    expect(cell('a\nb')).toBe('a b');
  });
});

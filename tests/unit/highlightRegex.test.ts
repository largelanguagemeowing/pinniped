import { describe, expect, it, vi } from 'vitest';
import { makeHighlightRegex } from '../../src/app/plugins/react-custom-html-parser';
import { findAndReplace } from '../../src/app/utils/findAndReplace';

// style modules are built by a bundler plugin; any class name will do here
vi.mock('../../src/app/styles/CustomHtml.css', () => ({}));

const highlighted = (regex: RegExp, text: string) =>
  findAndReplace(
    text,
    regex,
    (m) => `[${m[0]}]`,
    (t) => t
  ).join('');

describe('makeHighlightRegex', () => {
  it.each([
    ['one space between words', 'foo bar'],
    ['two spaces between words', 'foo  bar'],
    ['a leading space', ' foo bar'],
    ['a trailing space', 'foo bar '],
  ])('highlights every word of a query with %s', (_, query) => {
    const regex = makeHighlightRegex(query.split(' '));
    expect(regex).toBeDefined();
    expect(highlighted(regex!, 'Foo and Bar')).toBe('[Foo] and [Bar]');
  });

  it('has nothing to highlight for a query of only spaces', () => {
    expect(makeHighlightRegex('   '.split(' '))).toBeUndefined();
  });
});

describe('findAndReplace', () => {
  it('terminates on a global regex that matches the empty string', () => {
    expect(highlighted(/x*/g, 'axb')).toBe('a[x]b');
  });

  it('terminates on a non-global regex that matches the empty string', () => {
    expect(highlighted(/x*/, 'ab')).toBe('ab');
  });
});

import { describe, expect, it } from 'vitest';
import { parseBlockMD, parseInlineMD, tokenizeInlineMD } from '../../src/app/plugins/markdown';
import { unescapeMarkdownInlineSequences } from '../../src/app/plugins/markdown/utils';

// a text from another person (a profile biography) or a long paste has no limit on its marks
// (the inline rules rescan the rest of the text for every mark, so keep the inline counts modest)
const COUNT = 30000;
const INLINE_COUNT = 8000;
const count = (text: string, part: string) => text.split(part).length - 1;

describe('markdown parsers on a text with many marks', () => {
  it('parses inline marks one per word', () => {
    const html = parseInlineMD('*a* '.repeat(INLINE_COUNT));
    expect(count(html, '<i data-md="*">a</i>')).toBe(INLINE_COUNT);
  });

  it('parses block lines one per line', () => {
    const html = parseBlockMD('# h\n'.repeat(COUNT), parseInlineMD);
    expect(count(html, '<h1 data-md="#">h</h1>')).toBe(COUNT);
  });

  it('parses list items one per line', () => {
    const html = parseBlockMD('- x\n'.repeat(COUNT));
    expect(count(html, '<li>')).toBe(COUNT);
  });

  it('finds the ranges of inline marks', () => {
    const ranges = tokenizeInlineMD('*a* '.repeat(INLINE_COUNT));
    expect(ranges.filter((r) => r.mark === 'italic')).toHaveLength(INLINE_COUNT);
  });

  it('unescapes escaped marks', () => {
    expect(unescapeMarkdownInlineSequences('\\_ '.repeat(COUNT))).toBe('_ '.repeat(COUNT));
  });
});

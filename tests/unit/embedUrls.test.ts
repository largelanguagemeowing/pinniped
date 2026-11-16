import { describe, expect, it } from 'vitest';
import { getEmbedUrls } from '../../src/app/utils/regex';

describe('getEmbedUrls', () => {
  it('finds plain links once', () => {
    expect(getEmbedUrls('see https://a.org/x and https://a.org/x')).toEqual(['https://a.org/x']);
  });

  it.each([
    ["'https://a.org/x'", 'https://a.org/x'],
    ['"https://a.org/x"', 'https://a.org/x'],
    ["https://a.org'/", 'https://a.org'],
    ['(see https://a.org/x).', 'https://a.org/x'],
    ['https://a.org/x, then', 'https://a.org/x'],
  ])('leaves quotes and punctuation around %s out of the link', (body, url) => {
    expect(getEmbedUrls(body)).toEqual([url]);
  });

  it('keeps an apostrophe inside a link', () => {
    expect(getEmbedUrls("https://en.wikipedia.org/wiki/Conan_O'Brien is")).toEqual([
      "https://en.wikipedia.org/wiki/Conan_O'Brien",
    ]);
  });

  it('skips a link wrapped in <> as the opt-out', () => {
    expect(getEmbedUrls('<https://a.org/x>')).toEqual([]);
  });
});

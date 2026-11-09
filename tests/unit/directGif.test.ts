import { describe, expect, it } from 'vitest';
import { isDirectGifUrl } from '../../src/app/utils/directGif';
import { isMediaAutoEmbedUrl } from '../../src/app/utils/mediaAutoEmbed';
import { DEFAULT_MEDIA_EMBED_HOSTS, normalizeEmbedHost } from '../../src/app/utils/directGif';

const HOSTS = DEFAULT_MEDIA_EMBED_HOSTS;

const bridgeUrl =
  'https://bridge.agiadn.org/download/discordcdn/1370776315266859131/1549720052788494416/PrimeTime.gif';
const gifUrl = 'https://nyafiles.de/files/PrimeTime.gif';

describe('direct GIF URLs', () => {
  it('embeds GIF links from the allowed hosts instead of requesting a static URL preview', () => {
    expect(isMediaAutoEmbedUrl(gifUrl, HOSTS)).toBe(true);
    expect(isMediaAutoEmbedUrl('https://pissdichal.de/a.gif', HOSTS)).toBe(true);
  });

  it('embeds OOYE bridge media by default', () => {
    expect(isMediaAutoEmbedUrl(bridgeUrl, HOSTS)).toBe(true);
  });

  it('does not auto-load GIFs from other hosts', () => {
    expect(isMediaAutoEmbedUrl('https://cdn.discordapp.com/a/b/animation.gif', HOSTS)).toBe(false);
  });

  it('preserves the existing video host restrictions', () => {
    expect(isMediaAutoEmbedUrl('https://nyafiles.de/video.mp4', HOSTS)).toBe(true);
    expect(isMediaAutoEmbedUrl('https://pissdichal.de/video.webm', HOSTS)).toBe(true);
    expect(isMediaAutoEmbedUrl('https://example.org/video.mp4', HOSTS)).toBe(false);
  });

  it.each([
    gifUrl,
    `${gifUrl}?ex=123&hm=abc#preview`,
    'https://pissdichal.de/attachments/1/2/animation.GIF',
    'http://nyafiles.de/animation.gif',
  ])('recognizes %s', (url) => {
    expect(isDirectGifUrl(url, HOSTS)).toBe(true);
  });

  it.each([
    'not a URL',
    // eslint-disable-next-line no-script-url
    'javascript:animation.gif',
    'data:image/gif;base64,AAAA',
    'ftp://example.org/animation.gif',
    'https://example.org/animation.gif',
    'https://nyafiles.de/animation.mp4',
    'https://nyafiles.de/animation.gif.html',
    'https://nyafiles.de/animation.gif/other',
    'https://nyafiles.de/?file=animation.gif',
    'https://nyafiles.de/#animation.gif',
    'https://user:password@nyafiles.de/animation.gif',
  ])('leaves %s as a normal link', (url) => {
    expect(isDirectGifUrl(url, HOSTS)).toBe(false);
  });
});

describe('media embed host list', () => {
  it('matches only the listed hosts exactly', () => {
    expect(isMediaAutoEmbedUrl('https://cdn.nyafiles.de/a.gif', HOSTS)).toBe(false);
    expect(isMediaAutoEmbedUrl('https://example.org/a.gif', ['example.org'])).toBe(true);
  });

  it('accepts only bare host names', () => {
    expect(normalizeEmbedHost(' Example.ORG ')).toBe('example.org');
    expect(normalizeEmbedHost('https://example.org')).toBeUndefined();
    expect(normalizeEmbedHost('example.org/path')).toBeUndefined();
    expect(normalizeEmbedHost('localhost')).toBeUndefined();
    expect(normalizeEmbedHost('')).toBeUndefined();
  });
});

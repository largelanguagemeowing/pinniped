import { describe, expect, it } from 'vitest';
import { parseOoyeGif, getOoyeGifVideoUrl } from '../../src/app/utils/ooye';
import { getHostToAllow } from '../../src/app/utils/ooyeMedia';

const video = 'https://media.tenor.com/abc/cat.mp4';
const body = `[GIF] Cat ${video}`;

describe('OOYE GIF video hosts', () => {
  it('plays a GIF whose video host is on the list', () => {
    expect(parseOoyeGif({ body }, ['media.tenor.com'])).toBeDefined();
  });

  it('does not play a GIF whose video host is not on the list', () => {
    expect(parseOoyeGif({ body }, ['nyafiles.de'])).toBeUndefined();
  });

  it('matches hosts exactly, not by suffix', () => {
    expect(parseOoyeGif({ body }, ['tenor.com'])).toBeUndefined();
  });
});

describe('OOYE GIF allow prompt', () => {
  it('offers the video host when it is not on the list', () => {
    expect(getHostToAllow(getOoyeGifVideoUrl({ body })!, ['nyafiles.de'])).toBe('media.tenor.com');
  });

  it('offers nothing once the host is listed or the message is not a GIF', () => {
    expect(getHostToAllow(getOoyeGifVideoUrl({ body })!, ['media.tenor.com'])).toBeUndefined();
    expect(getOoyeGifVideoUrl({ body: 'hello https://media.tenor.com/a.mp4' })).toBeUndefined();
  });
});

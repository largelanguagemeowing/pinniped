import { describe, expect, it } from 'vitest';
import { getHostToAllow, isOoyeMediaUrl } from '../../src/app/utils/ooyeMedia';

const bridgeGif = 'https://bridge.example.net/download/discordcdn/1/2/PrimeTime.gif';

describe('OOYE media', () => {
  it('recognises bridged Discord media on any bridge host', () => {
    expect(isOoyeMediaUrl(bridgeGif)).toBe(true);
    expect(isOoyeMediaUrl('https://example.org/files/PrimeTime.gif')).toBe(false);
    expect(isOoyeMediaUrl('not a url')).toBe(false);
  });

  it('offers an unlisted bridge host that serves an embeddable file', () => {
    expect(getHostToAllow(bridgeGif, ['nyafiles.de'])).toBe('bridge.example.net');
    expect(getHostToAllow(bridgeGif.replace('PrimeTime.gif', 'clip.mp4'), [])).toBe(
      'bridge.example.net'
    );
  });

  it('offers nothing once the host is listed, or for non-embeddable links', () => {
    expect(getHostToAllow(bridgeGif, ['bridge.example.net'])).toBeUndefined();
    expect(
      getHostToAllow('https://bridge.example.net/download/discordcdn/1/2/file.pdf', [])
    ).toBeUndefined();
    // Callers only pass OOYE links; a plain link is never offered.
    expect(isOoyeMediaUrl('https://example.org/a.gif')).toBe(false);
  });
});

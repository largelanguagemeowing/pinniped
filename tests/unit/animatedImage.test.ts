import { describe, expect, it } from 'vitest';
import { animationInfo, detectImageAnimation } from '../../src/app/utils/animatedImage';

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const blob = (...parts: number[][]) => new Blob([new Uint8Array(parts.flat())]);

// GIF89a, 1x1, no global colour table
const GIF_HEADER = [...ascii('GIF89a'), 1, 0, 1, 0, 0, 0, 0];
const GIF_FRAME = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x44, 0x01, 0x00];
const GIF_CONTROL = [0x21, 0xf9, 0x04, 0, 0x0a, 0, 0, 0x00];
const GIF_TRAILER = [0x3b];

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngChunk = (type: string, length: number) => [
  0,
  0,
  0,
  length,
  ...ascii(type),
  ...new Array(length).fill(0),
  0,
  0,
  0,
  0,
];

const webp = (format: string, flags: number[]) => [
  ...ascii('RIFF'),
  0,
  0,
  0,
  0,
  ...ascii('WEBP'),
  ...ascii(format),
  10,
  0,
  0,
  0,
  ...flags,
];

describe('detectImageAnimation', () => {
  it('tells single and multi frame GIFs apart', async () => {
    expect(await detectImageAnimation(blob(GIF_HEADER, GIF_FRAME, GIF_TRAILER))).toBe('static');
    expect(
      await detectImageAnimation(
        blob(GIF_HEADER, GIF_CONTROL, GIF_FRAME, GIF_CONTROL, GIF_FRAME, GIF_TRAILER)
      )
    ).toBe('animated');
  });

  it('does not guess for a GIF it cannot read to the end', async () => {
    expect(await detectImageAnimation(blob(GIF_HEADER, GIF_FRAME))).toBe('unknown');
    expect(await detectImageAnimation(blob(GIF_HEADER, [0x99]))).toBe('unknown');
  });

  it('finds APNG animation control before the image data', async () => {
    const ihdr = pngChunk('IHDR', 13);
    expect(await detectImageAnimation(blob(PNG_SIGNATURE, ihdr, pngChunk('acTL', 8)))).toBe(
      'animated'
    );
    expect(await detectImageAnimation(blob(PNG_SIGNATURE, ihdr, pngChunk('IDAT', 4)))).toBe(
      'static'
    );
    expect(await detectImageAnimation(blob(PNG_SIGNATURE, ihdr))).toBe('unknown');
  });

  it('reads the WebP animation flag', async () => {
    expect(await detectImageAnimation(blob(webp('VP8X', [0x02])))).toBe('animated');
    expect(await detectImageAnimation(blob(webp('VP8X', [0x10])))).toBe('static');
    expect(await detectImageAnimation(blob(webp('VP8L', [0])))).toBe('static');
    expect(await detectImageAnimation(blob(webp('VP8X', [])))).toBe('unknown');
  });

  it('knows JPEG cannot animate and leaves other formats unknown', async () => {
    expect(await detectImageAnimation(blob([0xff, 0xd8, 0xff, 0xe0]))).toBe('static');
    expect(await detectImageAnimation(blob(ascii('BM')))).toBe('unknown');
    expect(await detectImageAnimation(blob([]))).toBe('unknown');
  });
});

describe('animationInfo', () => {
  it('sets is_animated only when the animation is known', () => {
    expect(animationInfo('animated')).toEqual({ is_animated: true });
    expect(animationInfo('static')).toEqual({ is_animated: false });
    expect(animationInfo('unknown')).toEqual({});
  });
});

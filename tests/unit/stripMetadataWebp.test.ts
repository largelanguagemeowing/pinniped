import { describe, expect, it } from 'vitest';
import { scanImageMetadata } from '../../src/app/features/image-metadata/scanImageMetadata';
import { webpChunks } from '../../src/app/utils/imageContainer';
import { stripMetadata, stripMetadataBytes } from '../../src/app/utils/stripMetadata';
import { readTiff, tiffOrientation } from '../../src/app/utils/tiff';

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const u32le = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];

const chunk = (type: string, data: number[]) => [
  ...ascii(type),
  ...u32le(data.length),
  ...data,
  ...(data.length % 2 ? [0] : []),
];

const riff = (chunks: number[][]) => {
  const body = [...ascii('WEBP'), ...chunks.flat()];
  return new Uint8Array([...ascii('RIFF'), ...u32le(body.length), ...body]);
};

// little-endian TIFF with an orientation entry and Make = "Acme"
const exifTiff = (orientation: number) => [
  0x49,
  0x49,
  0x2a,
  0,
  8,
  0,
  0,
  0, // header, IFD0 at 8
  2,
  0, // two entries
  0x12,
  0x01,
  3,
  0,
  1,
  0,
  0,
  0,
  orientation,
  0,
  0,
  0, // orientation
  0x0f,
  0x01,
  2,
  0,
  5,
  0,
  0,
  0,
  38,
  0,
  0,
  0, // Make, 5 bytes at 38
  0,
  0,
  0,
  0, // next IFD
  ...ascii('Acme\0'),
];

const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;
const VP8X_ICC = 0x20;
const vp8x = (flags: number) => chunk('VP8X', [flags, 0, 0, 0, 1, 0, 0, 1, 0, 0]);
const image = chunk('VP8L', [0x2f, 1, 2, 3, 4, 5, 6]);
const icc = chunk('ICCP', [9, 8, 7, 6]);
const xmp = chunk('XMP ', ascii('<x:xmpmeta><dc:creator>Alice</dc:creator></x:xmpmeta>'));

const types = (bytes: Uint8Array) => webpChunks(bytes)?.map((c) => c.type);

describe('stripMetadataBytes on WebP', () => {
  it('drops EXIF and XMP and clears their flags in VP8X', () => {
    const webp = riff([
      vp8x(VP8X_EXIF | VP8X_XMP | VP8X_ICC),
      icc,
      image,
      chunk('EXIF', exifTiff(1)),
      xmp,
    ]);
    expect(scanImageMetadata(webp).status).toBe('found');
    const out = stripMetadataBytes(webp)!;
    expect(types(out)).toEqual(['VP8X', 'ICCP', 'VP8L']);
    expect(webpChunks(out)![0].data[0]).toBe(VP8X_ICC);
    expect(scanImageMetadata(out).status).toBe('clean');
    expect(new TextDecoder('latin1').decode(out)).not.toMatch(/Acme|Alice/);
  });

  it('keeps the image data and the RIFF size describes the result', () => {
    const webp = riff([vp8x(VP8X_EXIF), image, chunk('EXIF', exifTiff(1))]);
    const out = stripMetadataBytes(webp)!;
    const view = new DataView(out.buffer);
    expect(view.getUint32(4, true)).toBe(out.length - 8);
    const kept = webpChunks(out)!.find((c) => c.type === 'VP8L')!;
    expect([...kept.data]).toEqual([0x2f, 1, 2, 3, 4, 5, 6]);
  });

  it('keeps a rotated orientation as a minimal EXIF chunk', () => {
    const webp = riff([vp8x(VP8X_EXIF), image, chunk('EXIF', exifTiff(6))]);
    const out = stripMetadataBytes(webp)!;
    expect(types(out)).toEqual(['VP8X', 'VP8L', 'EXIF']);
    const [header, , exif] = webpChunks(out)!;
    expect(header.data[0] & VP8X_EXIF).toBe(VP8X_EXIF);
    expect(tiffOrientation(readTiff(exif.data)!)).toBe(6);
    expect(new TextDecoder('latin1').decode(out)).not.toContain('Acme');
  });

  it('keeps an orientation that is also stored in a "Exif\\0\\0" prefixed chunk', () => {
    const webp = riff([
      vp8x(VP8X_EXIF),
      image,
      chunk('EXIF', [...ascii('Exif\0\0'), ...exifTiff(3)]),
    ]);
    const exif = webpChunks(stripMetadataBytes(webp)!)!.find((c) => c.type === 'EXIF')!;
    expect(tiffOrientation(readTiff(exif.data)!)).toBe(3);
  });

  it('writes no EXIF chunk for an upright photo', () => {
    const webp = riff([vp8x(VP8X_EXIF), image, chunk('EXIF', exifTiff(1))]);
    expect(types(stripMetadataBytes(webp)!)).not.toContain('EXIF');
  });

  it('handles odd-sized chunks and animations', () => {
    const anim = chunk('ANIM', [0, 0, 0, 0, 0, 0]);
    const frame = chunk('ANMF', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7]);
    const webp = riff([vp8x(VP8X_EXIF | 0x02), anim, frame, chunk('EXIF', [1, 2, 3])]);
    const out = stripMetadataBytes(webp)!;
    expect(types(out)).toEqual(['VP8X', 'ANIM', 'ANMF']);
    expect(webpChunks(out)![0].data[0]).toBe(0x02);
  });

  it('leaves a WebP without metadata as it is', () => {
    const webp = riff([image]);
    expect([...stripMetadataBytes(webp)!]).toEqual([...webp]);
  });

  it('gives up on a truncated WebP', () => {
    const webp = riff([vp8x(VP8X_EXIF), image, chunk('EXIF', exifTiff(1))]);
    expect(stripMetadataBytes(webp.subarray(0, webp.length - 10))).toBeUndefined();
  });
});

describe('stripMetadata on WebP files', () => {
  it('returns a file with the same name, type and date', async () => {
    const bytes = riff([vp8x(VP8X_EXIF), image, chunk('EXIF', exifTiff(1))]);
    const file = new File([bytes], 'photo.webp', { type: 'image/webp', lastModified: 1234 });
    const out = await stripMetadata(file);
    expect([out.name, out.type, out.lastModified]).toEqual(['photo.webp', 'image/webp', 1234]);
    expect(out.size).toBeLessThan(file.size);
  });
});

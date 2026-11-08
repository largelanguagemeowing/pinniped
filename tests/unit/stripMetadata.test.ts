import { describe, expect, it } from 'vitest';
import { stripMetadataBytes } from '../../src/app/utils/stripMetadata';

const u16 = (n: number) => [n >> 8, n & 255];
const seg = (marker: number, body: number[]) => [0xff, marker, ...u16(body.length + 2), ...body];
const exifBody = (orientation: number) => [
  0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0,
  orientation, 0, 0, 0, 0, 0, 0, 0,
];

describe('stripMetadataBytes', () => {
  it('drops EXIF/COM from JPEG but keeps orientation and image data', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8,
      ...seg(0xe1, exifBody(6)),
      ...seg(0xfe, [65, 66]),
      ...seg(0xdb, [1, 2, 3]),
      0xff, 0xda, 0, 4, 1, 2, 9, 9, 0xff, 0xd9,
    ]);
    const out = stripMetadataBytes(jpeg)!;
    expect(out[2]).toBe(0xff);
    expect(out[3]).toBe(0xe1);
    expect(out[31]).toBe(6);
    expect(out.length).toBe(2 + 36 + 7 + 10);
  });

  it('drops text chunks from PNG', () => {
    const chunk = (t: string, n: number) => [0, 0, 0, n, ...[...t].map((c) => c.charCodeAt(0)), ...new Array(n + 4).fill(7)];
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, ...chunk('IHDR', 1), ...chunk('tEXt', 2), ...chunk('IEND', 0)]);
    const out = stripMetadataBytes(png)!;
    expect(out.length).toBe(png.length - 14);
  });

  it('ignores other formats', () => {
    expect(stripMetadataBytes(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});

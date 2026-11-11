import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MetadataField,
  MetadataScan,
  scanImageMetadata,
} from '../../src/app/features/image-metadata/scanImageMetadata';
import { imageAttachment } from '../../src/app/features/image-metadata/imageAttachment';
import { stripMetadataBytes } from '../../src/app/utils/stripMetadata';

// written by exiv2 and Pillow; see fixtures/image-metadata/generate.sh
const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(__dirname, 'fixtures/image-metadata', name)));

const found = (scan: MetadataScan) => {
  if (scan.status !== 'found') throw new Error(`expected metadata, got ${scan.status}`);
  return scan.metadata;
};

const field = (fields: MetadataField[], label: string) =>
  fields.find((f) => f.label === label)?.value;

const sectionOf = (fields: MetadataField[], label: string) =>
  fields.find((f) => f.label === label)?.section;

describe('scanImageMetadata', () => {
  it('reads location, device, people and time from a little-endian JPEG', () => {
    const { fields, thumbnail } = found(scanImageMetadata(fixture('exiv2.jpg')));
    expect(field(fields, 'Coordinates')).toBe('52.520094, -13.400000');
    expect(sectionOf(fields, 'Coordinates')).toBe('location');
    expect(field(fields, 'Altitude')).toBe('-34.5 m');
    expect(field(fields, 'Serial number')).toBe('0123456789');
    expect(sectionOf(fields, 'Serial number')).toBe('device');
    expect(field(fields, 'Artist')).toBe('Jane Doe');
    expect(field(fields, 'Comment')).toBe('Grüße');
    expect(field(fields, 'Taken')).toBe('2024:05:01 12:34:56');
    expect(field(fields, 'Exposure time')).toBe('1/125 s');
    expect(field(fields, 'Aperture')).toBe('f/1.8');
    expect(field(fields, 'XMP')).toContain('Jane Doe');
    expect(thumbnail?.subarray(0, 2)).toEqual(new Uint8Array([0xff, 0xd8]));
  });

  it('reads a big-endian JPEG', () => {
    const { fields } = found(scanImageMetadata(fixture('pillow-be.jpg')));
    expect(field(fields, 'Coordinates')).toBe('-33.867778, 151.210000');
    expect(field(fields, 'Model')).toBe('iPhone 15');
    expect(field(fields, 'Author')).toBe('Jane');
  });

  it('reads PNG eXIf and text chunks', () => {
    const { fields } = found(scanImageMetadata(fixture('pillow.png')));
    expect(field(fields, 'parameters')).toBe('a cat, masterpiece, Steps: 20');
    expect(fields).toContainEqual({ section: 'text', label: 'Author', value: 'Jürgen' });
    expect(field(fields, 'Coordinates')).toBe('-33.867778, 151.210000');
  });

  it('reads WebP EXIF and XMP chunks', () => {
    const { fields } = found(scanImageMetadata(fixture('pillow.webp')));
    expect(field(fields, 'Coordinates')).toBe('-33.867778, 151.210000');
    expect(field(fields, 'XMP')).toContain('creator');
  });

  it('reports images without metadata as clean', () => {
    expect(scanImageMetadata(fixture('plain.jpg'))).toEqual({ status: 'clean' });
    expect(scanImageMetadata(fixture('plain.png'))).toEqual({ status: 'clean' });
  });

  it('reports what Pinniped sends as clean', () => {
    ['exiv2.jpg', 'pillow-be.jpg', 'pillow.png'].forEach((name) => {
      const stripped = stripMetadataBytes(fixture(name));
      expect(stripped).toBeDefined();
      expect(scanImageMetadata(stripped!)).toEqual({ status: 'clean' });
    });
  });

  it('keeps the orientation when stripping, which the scan does not report', () => {
    const stripped = stripMetadataBytes(fixture('exiv2.jpg'))!;
    // the stripper writes a minimal EXIF block for orientation 6
    expect(String.fromCharCode(...stripped.subarray(6, 10))).toBe('Exif');
    expect(scanImageMetadata(stripped).status).toBe('clean');
  });

  it('distinguishes unsupported and broken files', () => {
    expect(scanImageMetadata(new TextEncoder().encode('GIF89a'))).toEqual({
      status: 'unsupported',
    });
    const jpeg = fixture('exiv2.jpg');
    const broken = jpeg.slice();
    broken[2] = 0x00; // first marker no longer starts with 0xff
    expect(scanImageMetadata(broken)).toEqual({ status: 'unreadable' });
  });

  it('ignores padded empty text fields', () => {
    const tiff = [
      ...[0x49, 0x49, 42, 0, 8, 0, 0, 0], // little-endian header, IFD0 at 8
      ...[1, 0], // one entry
      ...[0x0e, 0x01, 2, 0, 8, 0, 0, 0, 26, 0, 0, 0], // ImageDescription, ASCII x8 at 26
      ...[0, 0, 0, 0], // no next IFD
      ...[0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0],
    ];
    const app1 = [...new TextEncoder().encode('Exif\0\0'), ...tiff];
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xe1,
      (app1.length + 2) >> 8,
      (app1.length + 2) & 0xff,
      ...app1,
      ...[0xff, 0xda, 0, 2, 0xff, 0xd9],
    ]);
    expect(scanImageMetadata(jpeg)).toEqual({ status: 'clean' });
  });

  it('survives corrupted files', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    ['exiv2.jpg', 'pillow-be.jpg', 'pillow.png', 'pillow.webp'].forEach((name) => {
      const original = fixture(name);
      for (let i = 0; i < 500; i += 1) {
        const bytes = original.slice(0, 1 + Math.floor(random() * original.length));
        for (let k = 0; k < 4; k += 1) {
          bytes[Math.floor(random() * bytes.length)] = Math.floor(random() * 256);
        }
        expect(() => scanImageMetadata(bytes)).not.toThrow();
      }
    });
  });
});

describe('imageAttachment', () => {
  const encrypted = {
    url: 'mxc://example.org/abc',
    v: 'v2',
    iv: 'aXY',
    hashes: { sha256: 'aGFzaA' },
    key: { alg: 'A256CTR', key_ops: ['encrypt', 'decrypt'], kty: 'oct', k: 'a2V5', ext: true },
  };

  it('reads unencrypted and encrypted images', () => {
    expect(
      imageAttachment({
        msgtype: 'm.image',
        url: 'mxc://example.org/abc',
        info: { mimetype: 'image/jpeg' },
      })
    ).toEqual({ mxc: 'mxc://example.org/abc', mimetype: 'image/jpeg' });
    expect(imageAttachment({ msgtype: 'm.image', file: encrypted })).toEqual({
      mxc: 'mxc://example.org/abc',
      mimetype: undefined,
      encInfo: {
        v: 'v2',
        iv: 'aXY',
        hashes: { sha256: 'aGFzaA' },
        key: encrypted.key,
      },
    });
  });

  it('rejects other messages and malformed attachments', () => {
    expect(imageAttachment({ msgtype: 'm.file', url: 'mxc://example.org/abc' })).toBeUndefined();
    expect(
      imageAttachment({ msgtype: 'm.image', url: 'https://example.org/a.jpg' })
    ).toBeUndefined();
    expect(
      imageAttachment({ msgtype: 'm.image', file: { ...encrypted, key: 'k' } })
    ).toBeUndefined();
    expect(
      imageAttachment({ msgtype: 'm.image', file: { ...encrypted, hashes: { sha256: 1 } } })
    ).toBeUndefined();
    expect(imageAttachment('m.image')).toBeUndefined();
  });
});

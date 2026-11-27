import { describe, expect, it } from 'vitest';
import { isHeif } from '../../src/app/utils/heif';
import { stripMetadata, stripMetadataBytes } from '../../src/app/utils/stripMetadata';

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const u16 = (n: number) => [n >> 8, n & 255];
const u32 = (n: number) => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];

const box = (type: string, body: number[]) => [...u32(body.length + 8), ...ascii(type), ...body];
const fullBox = (type: string, version: number, body: number[]) =>
  box(type, [version, 0, 0, 0, ...body]);

const infe = (id: number, type: string, tail: number[] = [0]) =>
  fullBox('infe', 2, [...u16(id), 0, 0, ...ascii(type), ...tail]);
const iinf = (entries: number[][]) =>
  fullBox('iinf', 0, [...u16(entries.length), ...entries.flat()]);

type Item = { id: number; method?: number; extents: [offset: number, length: number][] };

// offset and length take 4 bytes, no base offset, no extent index
const iloc = (version: 0 | 1 | 2, items: Item[]) =>
  fullBox('iloc', version, [
    0x44,
    0x00,
    ...(version < 2 ? u16(items.length) : u32(items.length)),
    ...items.flatMap(({ id, method = 0, extents }) => [
      ...(version < 2 ? u16(id) : u32(id)),
      ...(version === 0 ? [] : u16(method)),
      ...u16(0), // data reference index
      ...u16(extents.length),
      ...extents.flatMap(([offset, length]) => [...u32(offset), ...u32(length)]),
    ]),
  ]);

const EXIF = [
  ...u32(6),
  ...ascii('Exif\0\0'),
  ...ascii('MM\0*'),
  0,
  0,
  0,
  8,
  ...ascii('Acme-GPS-52.5N'),
];
const XMP = ascii('<x:xmpmeta><dc:creator>Alice</dc:creator></x:xmpmeta>');
const PIXELS = ascii('PIXELS-PIXELS-PIXELS');

const ftyp = (brand = 'heic') => box('ftyp', [...ascii(brand), ...u32(0), ...ascii('mif1heic')]);

type Layout = {
  version?: 0 | 1 | 2;
  /** Items stored in the `idat` box instead of `mdat`. */
  inIdat?: boolean;
  xmpType?: string;
  /** A box between `meta` and `mdat`. */
  extraTop?: number[];
  /** Writes the `mdat` size as 64 bits. */
  wideMdat?: boolean;
};

/** A HEIC file with an image, an Exif item and an XMP item. */
const heic = ({
  version = 1,
  inIdat = false,
  xmpType = 'application/rdf+xml',
  extraTop = [],
  wideMdat = false,
}: Layout = {}) => {
  const mdat = inIdat ? PIXELS : [...PIXELS, ...EXIF, ...XMP];
  const mdatHeader = wideMdat
    ? [...u32(1), ...ascii('mdat'), ...u32(0), ...u32(mdat.length + 16)]
    : [...u32(mdat.length + 8), ...ascii('mdat')];
  const meta = (mdatStart: number) => {
    const inMdat = (skip: number, length: number): Item['extents'] => [[mdatStart + skip, length]];
    const items: Item[] = inIdat
      ? [
          { id: 1, extents: inMdat(0, PIXELS.length) },
          { id: 2, method: 1, extents: [[0, EXIF.length]] },
          { id: 3, method: 1, extents: [[EXIF.length, XMP.length]] },
        ]
      : [
          { id: 1, extents: inMdat(0, PIXELS.length) },
          { id: 2, extents: inMdat(PIXELS.length, EXIF.length) },
          { id: 3, extents: inMdat(PIXELS.length + EXIF.length, XMP.length) },
        ];
    return box('meta', [
      0,
      0,
      0,
      0,
      ...fullBox('hdlr', 0, [...u32(0), ...ascii('pict'), ...new Array(13).fill(0)]),
      ...fullBox('pitm', 0, u16(1)),
      ...iinf([
        infe(1, 'hvc1'),
        infe(2, 'Exif'),
        infe(3, 'mime', [...ascii('XMP'), 0, ...ascii(xmpType), 0]),
      ]),
      ...iloc(version, items),
      ...(inIdat ? box('idat', [...EXIF, ...XMP]) : []),
    ]);
  };
  const head = ftyp();
  // the offsets in iloc depend on the size of meta, which does not depend on them
  const mdatStart = head.length + meta(0).length + extraTop.length + mdatHeader.length;
  return new Uint8Array([...head, ...meta(mdatStart), ...extraTop, ...mdatHeader, ...mdat]);
};

const find = (bytes: Uint8Array, needle: number[], from = 0) =>
  bytes.findIndex((_, i) => i >= from && needle.every((b, j) => bytes[i + j] === b));
const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

describe('stripMetadataBytes on HEIF', () => {
  it.each([0, 1, 2] as const)(
    'wipes the Exif and XMP items of an iloc version %i file',
    (version) => {
      const bytes = heic({ version });
      expect(text(bytes)).toContain('Acme');
      const out = stripMetadataBytes(bytes)!;
      expect(out.length).toBe(bytes.length);
      expect(text(out)).not.toMatch(/Acme|Alice|Exif/);
      expect(text(out)).toContain('PIXELS-PIXELS-PIXELS');
      expect(text(out)).toContain('free');
    }
  );

  it('only changes the metadata items and their entries', () => {
    const bytes = heic();
    const out = stripMetadataBytes(bytes)!;
    const same = (from: number, to: number) =>
      expect([...out.subarray(from, to)]).toEqual([...bytes.subarray(from, to)]);
    const iinfAt = find(bytes, ascii('iinf'));
    const ilocAt = find(bytes, ascii('iloc'));
    const exifAt = find(bytes, ascii('Exif\0\0'), ilocAt) - 4; // after the infe entries
    same(0, iinfAt); // ftyp, hdlr, pitm
    same(ilocAt, exifAt); // iloc, the mdat header and the image
    same(exifAt + EXIF.length + XMP.length, bytes.length);
    expect(out.subarray(exifAt, exifAt + EXIF.length + XMP.length).every((b) => b === 0)).toBe(
      true
    );
  });

  it('wipes items stored in the idat box', () => {
    const bytes = heic({ inIdat: true });
    const out = stripMetadataBytes(bytes)!;
    expect(out.length).toBe(bytes.length);
    expect(text(out)).not.toMatch(/Acme|Alice/);
    expect(text(out)).toContain('PIXELS-PIXELS-PIXELS');
  });

  it('keeps a mime item that is not XMP', () => {
    const bytes = heic({ xmpType: 'application/x-keep-me' });
    const out = stripMetadataBytes(bytes)!;
    expect(text(out)).not.toContain('Acme');
    expect(text(out)).toContain('Alice');
    expect(text(out)).toContain('application/x-keep-me');
  });

  it('wipes an XMP uuid box', () => {
    const xmpUuid = [
      0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf,
      0xac,
    ];
    const bytes = heic({ extraTop: box('uuid', [...xmpUuid, ...ascii('Bob-uuid-xmp')]) });
    expect(text(bytes)).toContain('Bob-uuid-xmp');
    const out = stripMetadataBytes(bytes)!;
    expect(text(out)).not.toContain('Bob-uuid-xmp');
    expect(out.length).toBe(bytes.length);
  });

  it('follows a 64-bit box size', () => {
    const out = stripMetadataBytes(heic({ wideMdat: true }))!;
    expect(text(out)).not.toMatch(/Acme|Alice/);
    expect(text(out)).toContain('PIXELS-PIXELS-PIXELS');
  });

  it('leaves a HEIF file without metadata items as it is', () => {
    const bytes = new Uint8Array([
      ...ftyp('avif'),
      ...box('meta', [
        0,
        0,
        0,
        0,
        ...iinf([infe(1, 'av01')]),
        ...iloc(1, [{ id: 1, extents: [[0, 1]] }]),
      ]),
      ...box('mdat', PIXELS),
    ]);
    expect(stripMetadataBytes(bytes)).toBeUndefined();
  });

  it('gives up on metadata outside the file', () => {
    const bytes = heic();
    expect(stripMetadataBytes(bytes.subarray(0, bytes.length - 20))).toBeUndefined();
  });

  it('is not tried on video', () => {
    const video = new Uint8Array([
      ...box('ftyp', [...ascii('isom'), ...u32(512), ...ascii('isomiso2')]),
      ...box('mdat', PIXELS),
    ]);
    expect(isHeif(video)).toBe(false);
    expect(stripMetadataBytes(video)).toBeUndefined();
  });

  it('recognises AVIF and HEIC brands, majors and compatible ones', () => {
    expect(isHeif(new Uint8Array(ftyp('avif')))).toBe(true);
    expect(isHeif(new Uint8Array(ftyp('heic')))).toBe(true);
    expect(
      isHeif(new Uint8Array(box('ftyp', [...ascii('isom'), ...u32(0), ...ascii('avif')])))
    ).toBe(true);
    expect(isHeif(new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe('stripMetadata on HEIC files', () => {
  it('returns a file with the same name, type and date', async () => {
    const bytes = heic();
    const file = new File([bytes], 'IMG_1.heic', { type: 'image/heic', lastModified: 99 });
    const out = await stripMetadata(file);
    expect([out.name, out.type, out.lastModified, out.size]).toEqual([
      'IMG_1.heic',
      'image/heic',
      99,
      file.size,
    ]);
    expect(text(new Uint8Array(await out.arrayBuffer()))).not.toContain('Acme');
  });
});

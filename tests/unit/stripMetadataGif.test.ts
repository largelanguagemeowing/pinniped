import { describe, expect, it } from 'vitest';
import { gifMetadataBlocks, isGif } from '../../src/app/utils/gif';
import { stripMetadata, stripMetadataBytes } from '../../src/app/utils/stripMetadata';

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

const subBlocks = (...blocks: number[][]) => [...blocks.flatMap((b) => [b.length, ...b]), 0];
const extension = (label: number, ...blocks: number[][]) => [0x21, label, ...subBlocks(...blocks)];
const comment = (words: string) => extension(0xfe, ascii(words));
const application = (id: string, ...blocks: number[][]) => extension(0xff, ascii(id), ...blocks);
const xmp = application('XMP DataXMP', ascii('<x:xmpmeta>Alice</x:xmpmeta>'));
const loop = application('NETSCAPE2.0', [1, 0, 0]);
const graphicControl = extension(0xf9, [4, 0, 0, 0]);
// 2x1 frame; `local` adds a two-colour local table
const frame = (local = false) => [
  0x2c,
  0,
  0,
  0,
  0,
  2,
  0,
  1,
  0,
  local ? 0x80 : 0,
  ...(local ? [0, 0, 0, 255, 255, 255] : []),
  2,
  ...subBlocks([0x44, 0x01], [0x05]),
];

const gif = (...blocks: number[][]) =>
  new Uint8Array([
    ...ascii('GIF89a'),
    2,
    0,
    1,
    0,
    0x80,
    0,
    0, // screen descriptor with a global table of two colours
    0,
    0,
    0,
    255,
    255,
    255,
    ...blocks.flat(),
    0x3b,
  ]);

describe('stripMetadataBytes on GIF', () => {
  it('drops comments and XMP but keeps the loop, timing and frames', () => {
    const input = gif(loop, comment('made by Alice'), graphicControl, frame(), xmp, comment('x'));
    expect(text(input)).toMatch(/Alice/);
    const out = stripMetadataBytes(input)!;
    expect(text(out)).not.toMatch(/Alice|made by/);
    expect([...out]).toEqual([...gif(loop, graphicControl, frame())]);
  });

  it('keeps frames that have local colour tables and several data blocks', () => {
    const input = gif(comment('hi'), frame(true), frame());
    expect([...stripMetadataBytes(input)!]).toEqual([...gif(frame(true), frame())]);
  });

  it('drops a comment made of several sub-blocks', () => {
    const input = gif(extension(0xfe, ascii('first'), ascii('second')), frame());
    expect([...stripMetadataBytes(input)!]).toEqual([...gif(frame())]);
  });

  it('keeps application extensions that are not XMP', () => {
    const input = gif(application('ICCRGBG1012', [1, 2, 3]), frame());
    expect(stripMetadataBytes(input)).toBeUndefined();
  });

  it('leaves a GIF without metadata as it is', () => {
    expect(stripMetadataBytes(gif(loop, frame()))).toBeUndefined();
  });

  it('gives up on a truncated GIF', () => {
    const input = gif(comment('hi'), frame());
    expect(gifMetadataBlocks(input.subarray(0, input.length - 6))).toBeUndefined();
    expect(stripMetadataBytes(input.subarray(0, input.length - 6))).toBeUndefined();
  });

  it('gives up on an unknown block', () => {
    const input = new Uint8Array([...gif(comment('hi')).subarray(0, 19), 0x99, 0x3b]);
    expect(stripMetadataBytes(input)).toBeUndefined();
  });

  it('recognises both GIF versions', () => {
    expect(isGif(new Uint8Array(ascii('GIF87a')))).toBe(true);
    expect(isGif(new Uint8Array(ascii('GIF89a')))).toBe(true);
    expect(isGif(new Uint8Array(ascii('GIF90a')))).toBe(false);
  });
});

describe('stripMetadata on GIF files', () => {
  it('returns a file with the same name, type and date', async () => {
    const file = new File([gif(comment('Alice'), frame())], 'fun.gif', {
      type: 'image/gif',
      lastModified: 5,
    });
    const out = await stripMetadata(file);
    expect([out.name, out.type, out.lastModified]).toEqual(['fun.gif', 'image/gif', 5]);
    expect(text(new Uint8Array(await out.arrayBuffer()))).not.toContain('Alice');
  });
});

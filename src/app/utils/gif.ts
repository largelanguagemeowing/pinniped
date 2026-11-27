// Finds the metadata blocks of a GIF without decoding pixels: comments and XMP packets.
// Shared by metadata stripping.

const textAt = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(start, start + length));

export const isGif = (bytes: Uint8Array): boolean =>
  bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(textAt(bytes, 0, 6));

const EXTENSION = 0x21;
const IMAGE = 0x2c;
const TRAILER = 0x3b;
const COMMENT_EXTENSION = 0xfe;
const APPLICATION_EXTENSION = 0xff;
const XMP_APPLICATION_ID = 'XMP DataXMP';

/** The position after the data sub-blocks that start at `pos`; undefined when they overrun. */
const afterSubBlocks = (bytes: Uint8Array, start: number): number | undefined => {
  let pos = start;
  while (pos < bytes.length) {
    const size = bytes[pos];
    pos += 1 + size;
    if (size === 0) return pos <= bytes.length ? pos : undefined;
  }
  return undefined;
};

/** The size in bytes of the colour table a packed field announces; 0 when there is none. */
const colourTableSize = (packed: number): number =>
  packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0;

/**
 * The byte ranges of the comment extensions and XMP application extensions; undefined when the
 * block structure cannot be followed to the trailer.
 */
export const gifMetadataBlocks = (
  bytes: Uint8Array
): [start: number, end: number][] | undefined => {
  if (!isGif(bytes) || bytes.length < 13) return undefined;
  const blocks: [number, number][] = [];
  let pos = 13 + colourTableSize(bytes[10]); // header, then the logical screen descriptor
  while (pos < bytes.length) {
    const kind = bytes[pos];
    if (kind === TRAILER) return blocks;
    if (kind === IMAGE) {
      if (pos + 10 > bytes.length) return undefined;
      // descriptor of 9 bytes, local colour table, LZW minimum code size, data sub-blocks
      const dataAt = pos + 10 + colourTableSize(bytes[pos + 9]) + 1;
      const end = dataAt <= bytes.length ? afterSubBlocks(bytes, dataAt) : undefined;
      if (end === undefined) return undefined;
      pos = end;
    } else if (kind === EXTENSION) {
      if (pos + 2 > bytes.length) return undefined;
      const label = bytes[pos + 1];
      const end = afterSubBlocks(bytes, pos + 2);
      if (end === undefined) return undefined;
      const isXmp =
        label === APPLICATION_EXTENSION &&
        bytes[pos + 2] === XMP_APPLICATION_ID.length &&
        textAt(bytes, pos + 3, XMP_APPLICATION_ID.length) === XMP_APPLICATION_ID;
      if (label === COMMENT_EXTENSION || isXmp) blocks.push([pos, end]);
      pos = end;
    } else {
      return undefined;
    }
  }
  return undefined;
};

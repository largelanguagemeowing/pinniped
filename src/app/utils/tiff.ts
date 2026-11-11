// Reads the IFDs of a TIFF structure as EXIF embeds it: IFD0, the thumbnail
// IFD1, and the Exif and GPS sub-IFDs. Every offset is bounds-checked; an IFD
// that points outside the data is skipped.

/** IFD0 describes the image, IFD1 its embedded thumbnail. */
export type TiffIfd = 'image' | 'thumbnail' | 'exif' | 'gps';

export type TiffValue =
  /** ASCII; up to the first NUL. */
  | { kind: 'text'; text: string }
  /** SHORT, LONG, signed, rational (as a quotient) and floating point types. */
  | { kind: 'numbers'; numbers: number[] }
  /** BYTE and UNDEFINED. */
  | { kind: 'bytes'; bytes: Uint8Array };

export type TiffEntry = { ifd: TiffIfd; tag: number; count: number; value: TiffValue };

export type Tiff = {
  byteOrder: 'little' | 'big';
  entries: TiffEntry[];
  /** The JPEG that IFD1 points at. */
  thumbnail?: Uint8Array;
};

export const TIFF_TAG = {
  orientation: 0x0112,
  exifIfd: 0x8769,
  gpsIfd: 0x8825,
  thumbnailOffset: 0x0201,
  thumbnailLength: 0x0202,
} as const;

/** Numeric values beyond this are not read; `count` keeps the full length. */
const MAX_NUMBERS = 64;

// byte size per component, by TIFF field type
const TYPE_SIZE: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
};

const readNumber = (view: DataView, type: number, at: number, little: boolean): number => {
  switch (type) {
    case 3:
      return view.getUint16(at, little);
    case 4:
      return view.getUint32(at, little);
    case 5:
      return view.getUint32(at, little) / view.getUint32(at + 4, little);
    case 6:
      return view.getInt8(at);
    case 8:
      return view.getInt16(at, little);
    case 9:
      return view.getInt32(at, little);
    case 10:
      return view.getInt32(at, little) / view.getInt32(at + 4, little);
    case 11:
      return view.getFloat32(at, little);
    default:
      return view.getFloat64(at, little);
  }
};

const utf8 = new TextDecoder('utf-8', { fatal: true });
const latin1 = new TextDecoder('latin1');

// ASCII fields are often UTF-8 in practice; anything else is read as Latin-1
const decodeText = (raw: Uint8Array): string => {
  try {
    return utf8.decode(raw);
  } catch {
    return latin1.decode(raw);
  }
};

export const readTiff = (bytes: Uint8Array): Tiff | undefined => {
  if (bytes.length < 8) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const order = view.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return undefined;
  const little = order === 0x4949;
  if (view.getUint16(2, little) !== 42) return undefined;

  const entries: TiffEntry[] = [];

  const readValue = (type: number, count: number, at: number): TiffValue => {
    if (type === 2) {
      const raw = bytes.subarray(at, at + count);
      const nul = raw.indexOf(0);
      return { kind: 'text', text: decodeText(nul === -1 ? raw : raw.subarray(0, nul)) };
    }
    if (type === 1 || type === 7) return { kind: 'bytes', bytes: bytes.subarray(at, at + count) };
    const numbers: number[] = [];
    for (let i = 0; i < Math.min(count, MAX_NUMBERS); i += 1) {
      numbers.push(readNumber(view, type, at + i * TYPE_SIZE[type], little));
    }
    return { kind: 'numbers', numbers };
  };

  /** Reads one IFD into `entries` and returns the offset of the next one (0 for none). */
  const readIfd = (ifd: TiffIfd, offset: number): number => {
    if (offset < 8 || offset + 2 > bytes.length) return 0;
    const count = view.getUint16(offset, little);
    const next = offset + 2 + count * 12;
    // a count that overruns the data still yields the entries that fit
    const readable = Math.min(count, Math.floor((bytes.length - offset - 2) / 12));
    for (let i = 0; i < readable; i += 1) {
      const entry = offset + 2 + i * 12;
      const type = view.getUint16(entry + 2, little);
      const valueCount = view.getUint32(entry + 4, little);
      const size = TYPE_SIZE[type];
      if (size !== undefined) {
        const length = size * valueCount;
        const at = length <= 4 ? entry + 8 : view.getUint32(entry + 8, little);
        if (at + length <= bytes.length) {
          entries.push({
            ifd,
            tag: view.getUint16(entry, little),
            count: valueCount,
            value: readValue(type, valueCount, at),
          });
        }
      }
    }
    return next + 4 <= bytes.length ? view.getUint32(next, little) : 0;
  };

  const pointer = (tag: number): number => {
    const entry = entries.find((e) => e.ifd === 'image' && e.tag === tag);
    return entry?.value.kind === 'numbers' ? (entry.value.numbers[0] ?? 0) : 0;
  };

  const ifd1 = readIfd('image', view.getUint32(4, little));
  // only these fixed links are followed, so a crafted offset cannot loop
  const exifIfd = pointer(TIFF_TAG.exifIfd);
  const gpsIfd = pointer(TIFF_TAG.gpsIfd);
  if (exifIfd) readIfd('exif', exifIfd);
  if (gpsIfd) readIfd('gps', gpsIfd);
  if (ifd1) readIfd('thumbnail', ifd1);

  const thumbnailField = (tag: number): number | undefined => {
    const entry = entries.find((e) => e.ifd === 'thumbnail' && e.tag === tag);
    return entry?.value.kind === 'numbers' ? entry.value.numbers[0] : undefined;
  };
  const thumbOffset = thumbnailField(TIFF_TAG.thumbnailOffset);
  const thumbLength = thumbnailField(TIFF_TAG.thumbnailLength);
  const thumbnail =
    thumbOffset !== undefined &&
    thumbLength !== undefined &&
    thumbLength > 0 &&
    thumbOffset + thumbLength <= bytes.length
      ? bytes.subarray(thumbOffset, thumbOffset + thumbLength)
      : undefined;

  return { byteOrder: little ? 'little' : 'big', entries, thumbnail };
};

/** The IFD0 orientation (1-8), when present and valid. */
export const tiffOrientation = (tiff: Tiff): number | undefined => {
  const entry = tiff.entries.find((e) => e.ifd === 'image' && e.tag === TIFF_TAG.orientation);
  const value = entry?.value.kind === 'numbers' ? entry.value.numbers[0] : undefined;
  return value !== undefined && value >= 1 && value <= 8 ? value : undefined;
};

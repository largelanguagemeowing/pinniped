// Lists the metadata a JPEG, PNG or WebP file carries beyond what is needed to
// display it, grouped by what it reveals about the sender.

import {
  Chunk,
  JPEG_APP13,
  JPEG_COM,
  imageContainer,
  jpegExif,
  jpegSegments,
  jpegXmp,
  pngChunks,
  webpChunks,
  webpExif,
} from '../../utils/imageContainer';
import { Tiff, TiffEntry, TiffValue, readTiff } from '../../utils/tiff';

/** In display order. */
export const METADATA_SECTIONS = [
  'location',
  'text',
  'time',
  'device',
  'software',
  'camera',
  'other',
] as const;
export type MetadataSection = (typeof METADATA_SECTIONS)[number];

export type MetadataField = { section: MetadataSection; label: string; value: string };

export type ImageMetadata = {
  fields: MetadataField[];
  /** An embedded preview JPEG; it can show the picture before it was cropped or edited. */
  thumbnail?: Uint8Array;
};

export type MetadataScan =
  /** Not a JPEG, PNG or WebP file. */
  | { status: 'unsupported' }
  /** The container structure is broken. */
  | { status: 'unreadable' }
  /** Nothing beyond what is needed to display the image. */
  | { status: 'clean' }
  | { status: 'found'; metadata: ImageMetadata };

const utf8 = new TextDecoder('utf-8');
const latin1 = new TextDecoder('latin1');

const trimText = (text: string): string => text.replace(/[\0\s]+$/, '').trim();

const formatNumber = (n: number): string =>
  Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : '?';

const isPrintable = (bytes: Uint8Array): boolean =>
  bytes.every((b) => b === 0 || b === 9 || b === 10 || b === 13 || (b >= 0x20 && b < 0x7f));

const formatBytes = (bytes: Uint8Array): string =>
  isPrintable(bytes) ? trimText(latin1.decode(bytes)) : `${bytes.length} bytes`;

const formatValue = (value: TiffValue, count: number): string => {
  switch (value.kind) {
    case 'text':
      return trimText(value.text);
    case 'numbers':
      return (
        value.numbers.map(formatNumber).join(', ') + (count > value.numbers.length ? ', …' : '')
      );
    default:
      return formatBytes(value.bytes);
  }
};

const firstNumber = (value: TiffValue | undefined): number | undefined => {
  if (value?.kind === 'numbers') return value.numbers[0];
  if (value?.kind === 'bytes') return value.bytes[0];
  return undefined;
};

const textOf = (value: TiffValue | undefined): string | undefined =>
  value?.kind === 'text' ? trimText(value.text) : undefined;

const utf16 = (bytes: Uint8Array, byteOrder: Tiff['byteOrder']): string =>
  new TextDecoder(byteOrder === 'little' ? 'utf-16le' : 'utf-16be').decode(bytes);

type TagFormat = (value: TiffValue, count: number, byteOrder: Tiff['byteOrder']) => string;

/** UserComment and GPSProcessingMethod start with an 8 byte character code. */
const encodedText: TagFormat = (value, count, byteOrder) => {
  if (value.kind !== 'bytes') return formatValue(value, count);
  const code = latin1.decode(value.bytes.subarray(0, 8));
  const text = value.bytes.subarray(8);
  if (code.startsWith('UNICODE')) return trimText(utf16(text, byteOrder));
  if (code.startsWith('ASCII') || code.startsWith('\0')) return trimText(utf8.decode(text));
  return formatBytes(value.bytes);
};

/** Windows XP* tags: UCS-2 little endian regardless of the TIFF byte order. */
const xpText: TagFormat = (value, count) =>
  value.kind === 'bytes' ? trimText(utf16(value.bytes, 'little')) : formatValue(value, count);

const withUnit =
  (unit: string): TagFormat =>
  (value, count) =>
    `${formatValue(value, count)} ${unit}`;

const exposureTime: TagFormat = (value, count, byteOrder) => {
  const seconds = firstNumber(value);
  if (seconds === undefined || !(seconds > 0) || seconds >= 0.25) {
    return withUnit('s')(value, count, byteOrder);
  }
  return `1/${Math.round(1 / seconds)} s`;
};

const aperture: TagFormat = (value, count) => `f/${formatValue(value, count)}`;

const vendorData: TagFormat = (value, count) =>
  value.kind === 'bytes' ? `${value.bytes.length} bytes of vendor data` : formatValue(value, count);

type TagSpec = { section: MetadataSection; label: string; format?: TagFormat };

/** Tags that only describe how to display the image. */
const STRUCTURE = 'structure';

// IFD0 and the Exif IFD share one tag space.
const TIFF_TAGS: Record<number, TagSpec | typeof STRUCTURE> = {
  0x00fe: STRUCTURE, // NewSubfileType
  0x0100: STRUCTURE, // ImageWidth
  0x0101: STRUCTURE, // ImageLength
  0x0102: STRUCTURE, // BitsPerSample
  0x0103: STRUCTURE, // Compression
  0x0106: STRUCTURE, // PhotometricInterpretation
  0x0111: STRUCTURE, // StripOffsets
  0x0112: STRUCTURE, // Orientation
  0x0115: STRUCTURE, // SamplesPerPixel
  0x0116: STRUCTURE, // RowsPerStrip
  0x0117: STRUCTURE, // StripByteCounts
  0x011a: STRUCTURE, // XResolution
  0x011b: STRUCTURE, // YResolution
  0x011c: STRUCTURE, // PlanarConfiguration
  0x0128: STRUCTURE, // ResolutionUnit
  0x0201: STRUCTURE, // JPEGInterchangeFormat
  0x0202: STRUCTURE, // JPEGInterchangeFormatLength
  0x0211: STRUCTURE, // YCbCrCoefficients
  0x0212: STRUCTURE, // YCbCrSubSampling
  0x0213: STRUCTURE, // YCbCrPositioning
  0x0214: STRUCTURE, // ReferenceBlackWhite
  0x8769: STRUCTURE, // ExifIFD
  0x8825: STRUCTURE, // GPSIFD
  0x9000: STRUCTURE, // ExifVersion
  0x9101: STRUCTURE, // ComponentsConfiguration
  0xa000: STRUCTURE, // FlashpixVersion
  0xa001: STRUCTURE, // ColorSpace
  0xa002: STRUCTURE, // PixelXDimension
  0xa003: STRUCTURE, // PixelYDimension
  0xa005: STRUCTURE, // InteropIFD
  0xa500: STRUCTURE, // Gamma

  0x010d: { section: 'text', label: 'Document name' },
  0x010e: { section: 'text', label: 'Description' },
  0x013b: { section: 'text', label: 'Artist' },
  0x8298: { section: 'text', label: 'Copyright' },
  0x9286: { section: 'text', label: 'Comment', format: encodedText },
  0x9c9b: { section: 'text', label: 'Title', format: xpText },
  0x9c9c: { section: 'text', label: 'Comment', format: xpText },
  0x9c9d: { section: 'text', label: 'Author', format: xpText },
  0x9c9e: { section: 'text', label: 'Keywords', format: xpText },
  0x9c9f: { section: 'text', label: 'Subject', format: xpText },
  0xa430: { section: 'text', label: 'Camera owner' },

  0x0132: { section: 'time', label: 'Modified' },
  0x9003: { section: 'time', label: 'Taken' },
  0x9004: { section: 'time', label: 'Digitized' },
  0x9010: { section: 'time', label: 'Time zone (modified)' },
  0x9011: { section: 'time', label: 'Time zone (taken)' },
  0x9012: { section: 'time', label: 'Time zone (digitized)' },
  0x9290: { section: 'time', label: 'Subseconds (modified)' },
  0x9291: { section: 'time', label: 'Subseconds (taken)' },
  0x9292: { section: 'time', label: 'Subseconds (digitized)' },

  0x010f: { section: 'device', label: 'Make' },
  0x0110: { section: 'device', label: 'Model' },
  0x013c: { section: 'device', label: 'Host computer' },
  0x927c: { section: 'device', label: 'Maker notes', format: vendorData },
  0xa420: { section: 'device', label: 'Unique image ID' },
  0xa431: { section: 'device', label: 'Serial number' },
  0xa433: { section: 'device', label: 'Lens make' },
  0xa434: { section: 'device', label: 'Lens model' },
  0xa435: { section: 'device', label: 'Lens serial number' },

  0x000b: { section: 'software', label: 'Processing software' },
  0x0131: { section: 'software', label: 'Software' },

  0x829a: { section: 'camera', label: 'Exposure time', format: exposureTime },
  0x829d: { section: 'camera', label: 'Aperture', format: aperture },
  0x8822: { section: 'camera', label: 'Exposure program' },
  0x8827: { section: 'camera', label: 'ISO' },
  0x8830: { section: 'camera', label: 'Sensitivity type' },
  0x8832: { section: 'camera', label: 'Recommended exposure index' },
  0x9201: { section: 'camera', label: 'Shutter speed (APEX)' },
  0x9202: { section: 'camera', label: 'Aperture (APEX)' },
  0x9203: { section: 'camera', label: 'Brightness (APEX)' },
  0x9204: { section: 'camera', label: 'Exposure bias', format: withUnit('EV') },
  0x9205: { section: 'camera', label: 'Max aperture (APEX)' },
  0x9206: { section: 'camera', label: 'Subject distance', format: withUnit('m') },
  0x9207: { section: 'camera', label: 'Metering mode' },
  0x9208: { section: 'camera', label: 'Light source' },
  0x9209: { section: 'camera', label: 'Flash' },
  0x920a: { section: 'camera', label: 'Focal length', format: withUnit('mm') },
  0x9214: { section: 'camera', label: 'Subject area' },
  0xa20e: { section: 'camera', label: 'Focal plane X resolution' },
  0xa20f: { section: 'camera', label: 'Focal plane Y resolution' },
  0xa210: { section: 'camera', label: 'Focal plane resolution unit' },
  0xa217: { section: 'camera', label: 'Sensing method' },
  0xa300: { section: 'camera', label: 'File source' },
  0xa301: { section: 'camera', label: 'Scene type' },
  0xa401: { section: 'camera', label: 'Custom rendered' },
  0xa402: { section: 'camera', label: 'Exposure mode' },
  0xa403: { section: 'camera', label: 'White balance' },
  0xa404: { section: 'camera', label: 'Digital zoom' },
  0xa405: { section: 'camera', label: 'Focal length (35 mm)', format: withUnit('mm') },
  0xa406: { section: 'camera', label: 'Scene capture type' },
  0xa407: { section: 'camera', label: 'Gain control' },
  0xa408: { section: 'camera', label: 'Contrast' },
  0xa409: { section: 'camera', label: 'Saturation' },
  0xa40a: { section: 'camera', label: 'Sharpness' },
  0xa40c: { section: 'camera', label: 'Subject distance range' },
  0xa432: { section: 'camera', label: 'Lens specification' },
};

// GPS tags that gpsFields does not combine into a field of its own
const GPS_TAGS: Record<number, TagSpec | typeof STRUCTURE> = {
  0x00: STRUCTURE, // GPSVersionID
  0x08: { section: 'location', label: 'Satellites' },
  0x09: { section: 'location', label: 'Receiver status' },
  0x0a: { section: 'location', label: 'Measurement mode' },
  0x0b: { section: 'location', label: 'Dilution of precision' },
  0x12: { section: 'location', label: 'Map datum' },
  0x1b: { section: 'location', label: 'Positioning method', format: encodedText },
  0x1c: { section: 'location', label: 'Area', format: encodedText },
  0x1e: { section: 'location', label: 'Differential correction' },
};

const hexTag = (tag: number): string => `0x${tag.toString(16).padStart(4, '0')}`;

const coordinate = (
  dms: TiffValue | undefined,
  ref: TiffValue | undefined,
  negative: string
): number | undefined => {
  if (dms?.kind !== 'numbers' || dms.numbers.length === 0) return undefined;
  const [d, m = 0, s = 0] = dms.numbers;
  const value = d + m / 60 + s / 3600;
  if (!Number.isFinite(value)) return undefined;
  return textOf(ref)?.toUpperCase() === negative ? -value : value;
};

const SPEED_UNITS: Record<string, string> = { K: 'km/h', M: 'mph', N: 'knots' };

/** The GPS IFD; value and reference tags are combined into one field each. */
const gpsFields = (entries: TiffEntry[], byteOrder: Tiff['byteOrder']): MetadataField[] => {
  const byTag = new Map(entries.map((e) => [e.tag, e.value]));
  const consumed = new Set<number>();
  const fields: MetadataField[] = [];
  const add = (label: string, value: string, tags: number[]) => {
    tags.forEach((t) => consumed.add(t));
    fields.push({ section: 'location', label, value });
  };

  const latitude = coordinate(byTag.get(0x02), byTag.get(0x01), 'S');
  const longitude = coordinate(byTag.get(0x04), byTag.get(0x03), 'W');
  if (latitude !== undefined && longitude !== undefined) {
    add('Coordinates', `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, [0x01, 0x02, 0x03, 0x04]);
  }

  const altitude = firstNumber(byTag.get(0x06));
  if (altitude !== undefined && Number.isFinite(altitude)) {
    const below = firstNumber(byTag.get(0x05)) === 1;
    add('Altitude', `${formatNumber(below ? -altitude : altitude)} m`, [0x05, 0x06]);
  }

  const time = byTag.get(0x07);
  if (time?.kind === 'numbers' && time.numbers.length === 3) {
    const clock = time.numbers.map((n) => String(Math.floor(n)).padStart(2, '0')).join(':');
    const date = textOf(byTag.get(0x1d));
    add('Time', `${date ? `${date} ` : ''}${clock} UTC`, [0x07, 0x1d]);
  }

  const speed = firstNumber(byTag.get(0x0d));
  if (speed !== undefined) {
    const unit = SPEED_UNITS[textOf(byTag.get(0x0c)) ?? 'K'] ?? '';
    add('Speed', `${formatNumber(speed)} ${unit}`.trim(), [0x0c, 0x0d]);
  }

  const bearing = (label: string, refTag: number, valueTag: number) => {
    const degrees = firstNumber(byTag.get(valueTag));
    if (degrees === undefined) return;
    const magnetic = textOf(byTag.get(refTag)) === 'M' ? ' (magnetic)' : '';
    add(label, `${formatNumber(degrees)}°${magnetic}`, [refTag, valueTag]);
  };
  bearing('Movement direction', 0x0e, 0x0f);
  bearing('Camera direction', 0x10, 0x11);
  bearing('Destination bearing', 0x17, 0x18);

  const destLatitude = coordinate(byTag.get(0x14), byTag.get(0x13), 'S');
  const destLongitude = coordinate(byTag.get(0x16), byTag.get(0x15), 'W');
  if (destLatitude !== undefined && destLongitude !== undefined) {
    const value = `${destLatitude.toFixed(6)}, ${destLongitude.toFixed(6)}`;
    add('Destination', value, [0x13, 0x14, 0x15, 0x16]);
  }

  const accuracy = firstNumber(byTag.get(0x1f));
  if (accuracy !== undefined) add('Accuracy', `± ${formatNumber(accuracy)} m`, [0x1f]);

  entries
    .filter((e) => !consumed.has(e.tag))
    .forEach((e) => {
      const spec = GPS_TAGS[e.tag];
      if (spec === STRUCTURE) return;
      const label = spec?.label ?? `GPS tag ${hexTag(e.tag)}`;
      const value = spec?.format?.(e.value, e.count, byteOrder) ?? formatValue(e.value, e.count);
      fields.push({ section: 'location', label, value });
    });
  return fields;
};

// the thumbnail IFD only describes the embedded preview, which is reported on its own
const tiffFields = (tiff: Tiff): MetadataField[] => [
  ...tiff.entries
    .filter((e) => e.ifd === 'image' || e.ifd === 'exif')
    .flatMap((e): MetadataField[] => {
      const spec = TIFF_TAGS[e.tag];
      if (spec === STRUCTURE) return [];
      const section = spec?.section ?? 'other';
      const label = spec?.label ?? `Tag ${hexTag(e.tag)}`;
      const value =
        spec?.format?.(e.value, e.count, tiff.byteOrder) ?? formatValue(e.value, e.count);
      return [{ section, label, value }];
    }),
  ...gpsFields(
    tiff.entries.filter((e) => e.ifd === 'gps'),
    tiff.byteOrder
  ),
];

const NOTHING: ImageMetadata = { fields: [] };

const exifMetadata = (data: Uint8Array): ImageMetadata => {
  const tiff = readTiff(data);
  if (!tiff) {
    const value = `${data.length} bytes that could not be read`;
    return { fields: [{ section: 'other', label: 'EXIF', value }] };
  }
  return { fields: tiffFields(tiff), thumbnail: tiff.thumbnail };
};

const xmpMetadata = (data: Uint8Array): ImageMetadata => ({
  fields: [{ section: 'other', label: 'XMP', value: utf8.decode(data) }],
});

const jpegMetadata = (bytes: Uint8Array): ImageMetadata[] | undefined =>
  jpegSegments(bytes)?.map((segment): ImageMetadata => {
    const exif = jpegExif(segment);
    if (exif) return exifMetadata(exif);
    const xmp = jpegXmp(segment);
    if (xmp) return xmpMetadata(xmp);
    if (segment.marker === JPEG_COM) {
      return { fields: [{ section: 'text', label: 'Comment', value: utf8.decode(segment.data) }] };
    }
    if (segment.marker === JPEG_APP13) {
      const value = `${segment.data.length} bytes`;
      return { fields: [{ section: 'other', label: 'IPTC / Photoshop data', value }] };
    }
    return NOTHING;
  });

// keywords from the PNG specification, by what they reveal; the rest is free text
const PNG_KEYWORD_SECTIONS: Record<string, MetadataSection> = {
  'Creation Time': 'time',
  Software: 'software',
  Source: 'device',
};

const pngTextMetadata = (keyword: string, value: string): ImageMetadata => ({
  fields: [{ section: PNG_KEYWORD_SECTIONS[keyword] ?? 'text', label: keyword, value }],
});

const nulAt = (data: Uint8Array, from = 0): number => {
  const index = data.indexOf(0, from);
  return index === -1 ? data.length : index;
};

const pngTextChunkMetadata = (chunk: Chunk): ImageMetadata => {
  const { data } = chunk;
  const keywordEnd = nulAt(data);
  const keyword = latin1.decode(data.subarray(0, keywordEnd));
  if (chunk.type === 'tEXt') {
    return pngTextMetadata(keyword, latin1.decode(data.subarray(keywordEnd + 1)));
  }
  if (chunk.type === 'zTXt') {
    // keyword, NUL, compression method, compressed text
    const length = Math.max(data.length - keywordEnd - 2, 0);
    return pngTextMetadata(keyword, `${length} bytes of compressed text`);
  }
  // iTXt: keyword, NUL, compression flag and method, language tag, NUL, translated keyword, NUL, text
  const compressed = data[keywordEnd + 1] === 1;
  const textStart = nulAt(data, nulAt(data, keywordEnd + 3) + 1) + 1;
  const text = data.subarray(Math.min(textStart, data.length));
  if (keyword === 'XML:com.adobe.xmp' && !compressed) return xmpMetadata(text);
  return pngTextMetadata(
    keyword,
    compressed ? `${text.length} bytes of compressed text` : utf8.decode(text)
  );
};

const pngTimeMetadata = (data: Uint8Array): ImageMetadata => {
  if (data.length < 7) return NOTHING;
  const year = data[0] * 256 + data[1];
  const [month, day, hour, minute, second] = [...data.subarray(2, 7)].map((n) =>
    String(n).padStart(2, '0')
  );
  const value = `${year}-${month}-${day} ${hour}:${minute}:${second} UTC`;
  return { fields: [{ section: 'time', label: 'Modified', value }] };
};

const pngMetadata = (bytes: Uint8Array): ImageMetadata[] | undefined =>
  pngChunks(bytes)?.map((chunk): ImageMetadata => {
    switch (chunk.type) {
      case 'eXIf':
        return exifMetadata(chunk.data);
      case 'tEXt':
      case 'zTXt':
      case 'iTXt':
        return pngTextChunkMetadata(chunk);
      case 'tIME':
        return pngTimeMetadata(chunk.data);
      default:
        return NOTHING;
    }
  });

const webpMetadata = (bytes: Uint8Array): ImageMetadata[] | undefined =>
  webpChunks(bytes)?.map((chunk): ImageMetadata => {
    if (chunk.type === 'EXIF') return exifMetadata(webpExif(chunk));
    if (chunk.type === 'XMP ') return xmpMetadata(chunk.data);
    return NOTHING;
  });

export const scanImageMetadata = (bytes: Uint8Array): MetadataScan => {
  const container = imageContainer(bytes);
  if (container === 'other') return { status: 'unsupported' };
  const parts = {
    jpeg: jpegMetadata,
    png: pngMetadata,
    webp: webpMetadata,
  }[container](bytes);
  if (!parts) return { status: 'unreadable' };
  // empty values (cameras pad unused text fields) reveal nothing
  const fields = parts.flatMap((p) => p.fields).filter((f) => f.value.trim() !== '');
  const thumbnail = parts.find((p) => p.thumbnail)?.thumbnail;
  if (fields.length === 0 && !thumbnail) return { status: 'clean' };
  return { status: 'found', metadata: { fields, thumbnail } };
};

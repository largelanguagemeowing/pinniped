// Walks the JPEG, PNG and WebP containers without decoding pixels; shared by
// metadata stripping and metadata reading.

export type ImageContainer = 'jpeg' | 'png' | 'webp' | 'other';

const fourCC = (bytes: Uint8Array, offset: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + 4));

const dataView = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

export const imageContainer = (bytes: Uint8Array): ImageContainer => {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png';
  }
  if (bytes.length >= 12 && fourCC(bytes, 0) === 'RIFF' && fourCC(bytes, 8) === 'WEBP') {
    return 'webp';
  }
  return 'other';
};

/** A JPEG marker segment; `start..end` spans the whole segment, `data` is its payload. */
export type JpegSegment = { marker: number; start: number; end: number; data: Uint8Array };

export const JPEG_APP1 = 0xe1;
export const JPEG_APP13 = 0xed;
export const JPEG_COM = 0xfe;
const JPEG_SOS = 0xda;

/**
 * The segments after SOI up to SOS, which runs to the end of the file;
 * undefined when the structure is broken before the scan data.
 */
export const jpegSegments = (bytes: Uint8Array): JpegSegment[] | undefined => {
  const view = dataView(bytes);
  const segments: JpegSegment[] = [];
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) return undefined;
    const marker = bytes[pos + 1];
    if (marker === 0xff) {
      pos += 1; // fill byte
    } else if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      segments.push({ marker, start: pos, end: pos + 2, data: bytes.subarray(pos + 2, pos + 2) });
      pos += 2;
    } else {
      const end = pos + 2 + view.getUint16(pos + 2);
      if (end < pos + 4 || end > bytes.length) return undefined;
      if (marker === JPEG_SOS) {
        segments.push({ marker, start: pos, end: bytes.length, data: bytes.subarray(pos + 4) });
        return segments;
      }
      segments.push({ marker, start: pos, end, data: bytes.subarray(pos + 4, end) });
      pos = end;
    }
  }
  return segments;
};

/** A PNG or RIFF chunk; `start..end` spans the whole chunk, `data` is its payload. */
export type Chunk = { type: string; start: number; end: number; data: Uint8Array };

/** The chunks after the signature; undefined when one overruns the file. */
export const pngChunks = (bytes: Uint8Array): Chunk[] | undefined => {
  const view = dataView(bytes);
  const chunks: Chunk[] = [];
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const end = pos + 12 + view.getUint32(pos);
    if (end > bytes.length) return undefined;
    chunks.push({
      type: fourCC(bytes, pos + 4),
      start: pos,
      end,
      data: bytes.subarray(pos + 8, end - 4),
    });
    pos = end;
  }
  return chunks;
};

/** The chunks inside the RIFF WEBP container; undefined when one overruns the file. */
export const webpChunks = (bytes: Uint8Array): Chunk[] | undefined => {
  const view = dataView(bytes);
  const chunks: Chunk[] = [];
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const dataEnd = pos + 8 + view.getUint32(pos + 4, true);
    if (dataEnd > bytes.length) return undefined;
    // odd-sized payloads are followed by a padding byte
    const end = Math.min(dataEnd + ((dataEnd - pos) % 2), bytes.length);
    chunks.push({
      type: fourCC(bytes, pos),
      start: pos,
      end,
      data: bytes.subarray(pos + 8, dataEnd),
    });
    pos = end;
  }
  return chunks;
};

const startsWithAscii = (data: Uint8Array, prefix: string): boolean =>
  data.length >= prefix.length && [...prefix].every((c, i) => data[i] === c.charCodeAt(0));

const EXIF_HEADER = 'Exif\0\0';
const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\0';

/** The TIFF structure inside a JPEG APP1 EXIF segment. */
export const jpegExif = (segment: JpegSegment): Uint8Array | undefined =>
  segment.marker === JPEG_APP1 && startsWithAscii(segment.data, 'Exif')
    ? segment.data.subarray(EXIF_HEADER.length)
    : undefined;

/** The XML packet inside a JPEG APP1 XMP segment. */
export const jpegXmp = (segment: JpegSegment): Uint8Array | undefined =>
  segment.marker === JPEG_APP1 && startsWithAscii(segment.data, XMP_HEADER)
    ? segment.data.subarray(XMP_HEADER.length)
    : undefined;

/** The TIFF structure in a WebP EXIF chunk; some writers keep the JPEG "Exif\0\0" header. */
export const webpExif = (chunk: Chunk): Uint8Array =>
  startsWithAscii(chunk.data, EXIF_HEADER) ? chunk.data.subarray(EXIF_HEADER.length) : chunk.data;

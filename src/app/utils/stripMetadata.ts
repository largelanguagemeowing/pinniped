// Removes privacy-relevant metadata (EXIF GPS, camera, timestamps, XMP, IPTC,
// comments) from JPEG, PNG, WebP, GIF, HEIC and AVIF files without re-encoding the
// pixels. The JPEG and WebP orientation is kept as a minimal EXIF block so photos
// do not end up rotated; HEIF carries it outside EXIF, in the image's own properties.

import {
  JPEG_APP1,
  JPEG_APP13,
  JPEG_COM,
  imageContainer,
  jpegExif,
  jpegSegments,
  pngChunks,
  webpChunks,
  webpExif,
} from './imageContainer';
import { gifMetadataBlocks, isGif } from './gif';
import { heifMetadata, isHeif } from './heif';
import { readTiff, tiffOrientation } from './tiff';

/** A TIFF structure whose only entry is the orientation. */
const orientationTiff = (orientation: number): Uint8Array => {
  const out = new Uint8Array(26);
  const view = new DataView(out.buffer);
  out.set([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8]); // big-endian TIFF header
  view.setUint16(8, 1); // one entry
  view.setUint16(10, 0x0112);
  view.setUint16(12, 3); // SHORT
  view.setUint32(14, 1);
  view.setUint16(18, orientation);
  return out;
};

const orientationSegment = (orientation: number): Uint8Array => {
  const out = new Uint8Array(36);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0xffe1);
  view.setUint16(2, 34);
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4); // "Exif\0\0"
  out.set(orientationTiff(orientation), 10);
  return out;
};

const orientationOf = (tiffs: (Uint8Array | undefined)[]): number | undefined =>
  tiffs
    .map((exif) => {
      const tiff = exif && readTiff(exif);
      return tiff && tiffOrientation(tiff);
    })
    .find((value) => value !== undefined);

const JPEG_METADATA_MARKERS = new Set([JPEG_APP1, JPEG_APP13, JPEG_COM]);

const stripJpeg = (bytes: Uint8Array): Uint8Array<ArrayBuffer> | undefined => {
  const segments = jpegSegments(bytes);
  if (!segments) return undefined;
  const orientation = orientationOf(segments.map(jpegExif));
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  if (orientation && orientation !== 1) parts.push(orientationSegment(orientation));
  // APP1 (EXIF/XMP), APP13 (IPTC/Photoshop) and COM carry metadata.
  segments
    .filter((segment) => !JPEG_METADATA_MARKERS.has(segment.marker))
    .forEach((segment) => parts.push(bytes.subarray(segment.start, segment.end)));
  return concat(parts);
};

const PNG_DROP = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);

const stripPng = (bytes: Uint8Array): Uint8Array<ArrayBuffer> | undefined => {
  const chunks = pngChunks(bytes);
  if (!chunks) return undefined;
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  chunks
    .filter((chunk) => !PNG_DROP.has(chunk.type))
    .forEach((chunk) => parts.push(bytes.subarray(chunk.start, chunk.end)));
  return concat(parts);
};

const WEBP_VP8X_EXIF_FLAG = 0x08;
const WEBP_VP8X_XMP_FLAG = 0x04;

const stripWebp = (bytes: Uint8Array): Uint8Array<ArrayBuffer> | undefined => {
  const chunks = webpChunks(bytes);
  if (!chunks) return undefined;
  const orientation = orientationOf(
    chunks.filter((chunk) => chunk.type === 'EXIF').map((chunk) => webpExif(chunk))
  );
  const keepOrientation = orientation !== undefined && orientation !== 1;
  const parts: Uint8Array[] = [bytes.subarray(0, 12)];
  let orientationWritten = false;
  chunks.forEach((chunk) => {
    if (chunk.type === 'XMP ') return;
    if (chunk.type === 'EXIF') {
      // a minimal block takes the place of the first EXIF chunk
      if (keepOrientation && !orientationWritten) {
        const header = new Uint8Array(8);
        header.set([0x45, 0x58, 0x49, 0x46]); // "EXIF"
        new DataView(header.buffer).setUint32(4, 26, true);
        parts.push(header, orientationTiff(orientation));
        orientationWritten = true;
      }
      return;
    }
    if (chunk.type === 'VP8X' && chunk.data.length >= 1) {
      // the flags say which metadata chunks follow
      const vp8x = bytes.slice(chunk.start, chunk.end);
      vp8x[8] &= ~(WEBP_VP8X_EXIF_FLAG | WEBP_VP8X_XMP_FLAG);
      if (keepOrientation) vp8x[8] |= WEBP_VP8X_EXIF_FLAG;
      parts.push(vp8x);
      return;
    }
    parts.push(bytes.subarray(chunk.start, chunk.end));
  });
  const out = concat(parts);
  new DataView(out.buffer).setUint32(4, out.length - 8, true); // RIFF size
  return out;
};

const stripGif = (bytes: Uint8Array): Uint8Array<ArrayBuffer> | undefined => {
  const blocks = gifMetadataBlocks(bytes);
  if (!blocks || blocks.length === 0) return undefined;
  const parts: Uint8Array[] = [];
  let from = 0;
  blocks.forEach(([start, end]) => {
    parts.push(bytes.subarray(from, start));
    from = end;
  });
  parts.push(bytes.subarray(from));
  return concat(parts);
};

/**
 * Overwrites the Exif and XMP items' data with zeros and retypes them to `free`, so the file keeps
 * its size and every offset in it stays valid; nothing needs to be moved or rewritten.
 */
const stripHeif = (bytes: Uint8Array): Uint8Array<ArrayBuffer> | undefined => {
  const found = heifMetadata(bytes);
  if (!found || (found.items.length === 0 && found.boxes.length === 0)) return undefined;
  const out = bytes.slice();
  found.items.forEach((item) => {
    out.set([0x66, 0x72, 0x65, 0x65], item.typeAt); // "free"
    out.fill(0, item.nameStart, item.nameEnd);
    item.extents.forEach(([start, end]) => out.fill(0, start, end));
  });
  found.boxes.forEach(({ start, body, end }) => {
    out.set([0x66, 0x72, 0x65, 0x65], start + 4); // "free"
    out.fill(0, body, end);
  });
  return out;
};

const concat = (parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)));
  let offset = 0;
  parts.forEach((p) => {
    out.set(p, offset);
    offset += p.length;
  });
  return out;
};

export const stripMetadataBytes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> | undefined => {
  switch (imageContainer(bytes)) {
    case 'jpeg':
      return stripJpeg(bytes);
    case 'png':
      return stripPng(bytes);
    case 'webp':
      return stripWebp(bytes);
    default:
      if (isGif(bytes)) return stripGif(bytes);
      return isHeif(bytes) ? stripHeif(bytes) : undefined;
  }
};

// enough for every format's signature, and for the brand list of a HEIF `ftyp` box
const SIGNATURE_BYTES = 4096;

const isSupportedImage = (head: Uint8Array): boolean =>
  imageContainer(head) !== 'other' || isGif(head) || isHeif(head);

/**
 * Returns the file without metadata, or the original when it is no supported image, has none or
 * cannot be parsed. Only the start of a file that is no supported image is read.
 */
export const stripMetadata = async (file: File): Promise<File> => {
  try {
    const head = new Uint8Array(await file.slice(0, SIGNATURE_BYTES).arrayBuffer());
    if (!isSupportedImage(head)) return file;
    const stripped = stripMetadataBytes(new Uint8Array(await file.arrayBuffer()));
    if (!stripped) return file;
    return new File([stripped], file.name, { type: file.type, lastModified: file.lastModified });
  } catch {
    return file;
  }
};

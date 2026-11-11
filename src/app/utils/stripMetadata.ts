// Removes privacy-relevant metadata (EXIF GPS, camera, timestamps, XMP, IPTC,
// comments) from JPEG and PNG files without re-encoding the pixels. The JPEG
// orientation is kept as a minimal EXIF block so photos do not end up rotated.

import {
  JPEG_APP1,
  JPEG_APP13,
  JPEG_COM,
  imageContainer,
  jpegExif,
  jpegSegments,
  pngChunks,
} from './imageContainer';
import { readTiff, tiffOrientation } from './tiff';

const orientationSegment = (orientation: number): Uint8Array => {
  const out = new Uint8Array(36);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0xffe1);
  view.setUint16(2, 34);
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4); // "Exif\0\0"
  out.set([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8], 10); // big-endian TIFF header
  view.setUint16(18, 1); // one entry
  view.setUint16(20, 0x0112);
  view.setUint16(22, 3); // SHORT
  view.setUint32(24, 1);
  view.setUint16(28, orientation);
  return out;
};

const JPEG_METADATA_MARKERS = new Set([JPEG_APP1, JPEG_APP13, JPEG_COM]);

const stripJpeg = (bytes: Uint8Array): Uint8Array<ArrayBuffer> | undefined => {
  const segments = jpegSegments(bytes);
  if (!segments) return undefined;
  const orientation = segments
    .map((segment) => {
      const exif = jpegExif(segment);
      const tiff = exif && readTiff(exif);
      return tiff && tiffOrientation(tiff);
    })
    .find((value) => value !== undefined);
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
    default:
      return undefined;
  }
};

/** Returns the file without metadata, or the original when it is not a JPEG/PNG or cannot be parsed. */
export const stripMetadata = async (file: File): Promise<File> => {
  try {
    const stripped = stripMetadataBytes(new Uint8Array(await file.arrayBuffer()));
    if (!stripped) return file;
    return new File([stripped], file.name, { type: file.type, lastModified: file.lastModified });
  } catch {
    return file;
  }
};

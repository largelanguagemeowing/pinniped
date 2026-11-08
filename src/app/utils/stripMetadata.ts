// Removes privacy-relevant metadata (EXIF GPS, camera, timestamps, XMP, IPTC,
// comments) from JPEG and PNG files without re-encoding the pixels. The JPEG
// orientation is kept as a minimal EXIF block so photos do not end up rotated.

const readOrientation = (view: DataView, start: number, end: number): number | undefined => {
  // start points at "Exif\0\0"
  const tiff = start + 6;
  if (tiff + 8 > end) return undefined;
  const little = view.getUint16(tiff) === 0x4949;
  if (!little && view.getUint16(tiff) !== 0x4d4d) return undefined;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > end) return undefined;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return undefined;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : undefined;
    }
  }
  return undefined;
};

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

const stripJpeg = (bytes: Uint8Array): Uint8Array<ArrayBuffer> | undefined => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let orientation: number | undefined;
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) return undefined;
    const marker = bytes[pos + 1];
    if (marker === 0xff) {
      pos += 1;
    } else if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      parts.push(bytes.subarray(pos, pos + 2));
      pos += 2;
    } else {
      const length = view.getUint16(pos + 2);
      const end = pos + 2 + length;
      if (length < 2 || end > bytes.length) return undefined;
      if (marker === 0xda) {
        parts.push(bytes.subarray(pos));
        break;
      }
      const isExif =
        marker === 0xe1 &&
        length >= 8 &&
        String.fromCharCode(...bytes.subarray(pos + 4, pos + 8)) === 'Exif';
      if (isExif) orientation ??= readOrientation(view, pos + 4, end);
      // APP1 (EXIF/XMP), APP13 (IPTC/Photoshop) and COM carry metadata.
      if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) {
        parts.push(bytes.subarray(pos, end));
      }
      pos = end;
    }
  }
  if (orientation && orientation !== 1) parts.splice(1, 0, orientationSegment(orientation));
  return concat(parts);
};

const PNG_DROP = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);

const stripPng = (bytes: Uint8Array): Uint8Array<ArrayBuffer> | undefined => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const end = pos + 12 + view.getUint32(pos);
    if (end > bytes.length) return undefined;
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    if (!PNG_DROP.has(type)) parts.push(bytes.subarray(pos, end));
    pos = end;
  }
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
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return stripJpeg(bytes);
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return stripPng(bytes);
  }
  return undefined;
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

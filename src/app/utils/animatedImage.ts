const GIF_SIGNATURE = [0x47, 0x49, 0x46, 0x38]; // GIF8
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0): boolean =>
  signature.every((byte, index) => bytes[offset + index] === byte);

const readFourCC = (bytes: Uint8Array, offset: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + 4));

const readUint32BE = (bytes: Uint8Array, offset: number): number =>
  bytes[offset] * 2 ** 24 +
  bytes[offset + 1] * 2 ** 16 +
  bytes[offset + 2] * 2 ** 8 +
  bytes[offset + 3];

// GIF sub-blocks are length-prefixed and terminated by a zero-length block
const skipGifSubBlocks = (bytes: Uint8Array, offset: number): number => {
  let pos = offset;
  while (pos < bytes.length && bytes[pos] !== 0) {
    pos += bytes[pos] + 1;
  }
  return pos + 1;
};

/** Whether an image animates; `unknown` when its format or structure could not be read. */
export type ImageAnimation = 'animated' | 'static' | 'unknown';

const GIF_EXTENSION = 0x21;
const GIF_IMAGE = 0x2c;
const GIF_TRAILER = 0x3b;

const gifAnimation = (bytes: Uint8Array): ImageAnimation => {
  let pos = 13; // header (6) + logical screen descriptor (7)
  const screenFlags = bytes[10];
  if (screenFlags >= 0x80) pos += 3 * 2 ** ((screenFlags % 8) + 1);

  let frames = 0;
  while (pos < bytes.length) {
    const block = bytes[pos];
    if (block === GIF_EXTENSION) {
      // introducer, label, then sub-blocks
      pos = skipGifSubBlocks(bytes, pos + 2);
    } else if (block === GIF_IMAGE) {
      frames += 1;
      if (frames > 1) return 'animated';
      const imageFlags = bytes[pos + 9];
      pos += 10;
      if (imageFlags >= 0x80) pos += 3 * 2 ** ((imageFlags % 8) + 1);
      pos += 1; // LZW minimum code size
      pos = skipGifSubBlocks(bytes, pos);
    } else if (block === GIF_TRAILER) {
      return 'static';
    } else {
      return 'unknown';
    }
  }
  return 'unknown'; // truncated before the trailer
};

const webpAnimation = (bytes: Uint8Array): ImageAnimation => {
  const format = readFourCC(bytes, 12);
  // the simple lossy and lossless formats hold a single frame
  if (format === 'VP8 ' || format === 'VP8L') return 'static';
  // extended format: "VP8X" size flags, animation is flag bit 0x02
  if (format !== 'VP8X' || bytes.length <= 20) return 'unknown';
  return Math.floor(bytes[20] / 2) % 2 === 1 ? 'animated' : 'static';
};

const pngAnimation = (bytes: Uint8Array): ImageAnimation => {
  // APNG declares an acTL chunk before the first IDAT chunk
  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const length = readUint32BE(bytes, pos);
    const type = readFourCC(bytes, pos + 4);
    if (type === 'acTL') return 'animated';
    if (type === 'IDAT') return 'static';
    pos += 12 + length;
  }
  return 'unknown';
};

/**
 * Detects animation in GIF, WebP and PNG (APNG) files by inspecting their container
 * structure. JPEG cannot animate; any other format is `unknown`.
 */
export const detectImageAnimation = async (file: Blob): Promise<ImageAnimation> => {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (startsWith(bytes, GIF_SIGNATURE)) return gifAnimation(bytes);
    if (readFourCC(bytes, 0) === 'RIFF' && readFourCC(bytes, 8) === 'WEBP') {
      return webpAnimation(bytes);
    }
    if (startsWith(bytes, PNG_SIGNATURE)) return pngAnimation(bytes);
    if (startsWith(bytes, JPEG_SIGNATURE)) return 'static';
    return 'unknown';
  } catch {
    return 'unknown';
  }
};

/** The `is_animated` image info field, left out when the animation is unknown. */
export const animationInfo = (animation: ImageAnimation): { is_animated?: boolean } =>
  animation === 'unknown' ? {} : { is_animated: animation === 'animated' };

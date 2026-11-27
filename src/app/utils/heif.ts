// Finds the metadata in HEIF files (HEIC, AVIF) without decoding pixels. EXIF and XMP are items
// of the `meta` box: `iinf` names them, `iloc` says where their bytes are. Shared by metadata
// stripping; reading metadata out of HEIF is not supported.

type IsoBox = { type: string; start: number; end: number; body: number };

/** Where the bytes of a metadata item are, and which `infe` box names it. */
export type HeifMetadataItem = {
  /** The item's 4-character type inside its `infe` box. */
  typeAt: number;
  /** The rest of the `infe` box after the type: name and content type. */
  nameStart: number;
  nameEnd: number;
  /** Absolute byte ranges of the item's data. */
  extents: [start: number, end: number][];
};

/** Metadata that sits in a box of its own instead of an item. */
export type HeifMetadataBox = { start: number; body: number; end: number };

export type HeifMetadata = { items: HeifMetadataItem[]; boxes: HeifMetadataBox[] };

const FTYP_IMAGE_BRANDS = new Set([
  'heic',
  'heix',
  'heim',
  'heis',
  'hevc',
  'hevx',
  'hevm',
  'hevs',
  'avif',
  'avis',
  'mif1',
  'msf1',
]);
const XMP_CONTENT_TYPE = 'application/rdf+xml';
// extended type of the `uuid` box some tools write XMP into
const XMP_UUID = [
  0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac,
];

const fourCC = (bytes: Uint8Array, offset: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + 4));

const dataView = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** The boxes from `start` to `end`; undefined when one is malformed or overruns `end`. */
const isoBoxes = (bytes: Uint8Array, start: number, end: number): IsoBox[] | undefined => {
  const view = dataView(bytes);
  const boxes: IsoBox[] = [];
  let pos = start;
  while (pos < end) {
    if (pos + 8 > end) return undefined;
    let size = view.getUint32(pos);
    let body = pos + 8;
    if (size === 1) {
      if (pos + 16 > end || view.getUint32(pos + 8) !== 0) return undefined;
      size = view.getUint32(pos + 12);
      body = pos + 16;
    } else if (size === 0) {
      size = end - pos; // runs to the end
    }
    if (size < body - pos || pos + size > end) return undefined;
    boxes.push({ type: fourCC(bytes, pos + 4), start: pos, end: pos + size, body });
    pos += size;
  }
  return boxes;
};

/** Whether the file starts with an `ftyp` box that names a HEIF image brand. */
export const isHeif = (bytes: Uint8Array): boolean => {
  if (bytes.length < 16 || fourCC(bytes, 4) !== 'ftyp') return false;
  const size = Math.min(dataView(bytes).getUint32(0), bytes.length);
  if (size < 16) return false;
  // major brand, minor version, then the compatible brands
  const brands = [fourCC(bytes, 8)];
  for (let pos = 16; pos + 4 <= size; pos += 4) brands.push(fourCC(bytes, pos));
  return brands.some((brand) => FTYP_IMAGE_BRANDS.has(brand));
};

const cString = (bytes: Uint8Array, start: number, end: number): [text: string, next: number] => {
  let stop = start;
  while (stop < end && bytes[stop] !== 0) stop += 1;
  return [String.fromCharCode(...bytes.subarray(start, stop)), Math.min(stop + 1, end)];
};

type InfeEntry = { id: number; item: Omit<HeifMetadataItem, 'extents'> };

/** The Exif and XMP entries of an `iinf` box; undefined when it is malformed. */
const metadataEntries = (bytes: Uint8Array, iinf: IsoBox): InfeEntry[] | undefined => {
  const view = dataView(bytes);
  const version = bytes[iinf.body];
  const countSize = version === 0 ? 2 : 4;
  if (iinf.body + 4 + countSize > iinf.end) return undefined;
  const infes = isoBoxes(bytes, iinf.body + 4 + countSize, iinf.end);
  if (!infes) return undefined;
  const entries: InfeEntry[] = [];
  for (const infe of infes) {
    // versions 0 and 1 carry no item type; they predate Exif and XMP items
    const infeVersion = bytes[infe.body];
    if (infe.type !== 'infe' || infeVersion < 2) continue;
    const idSize = infeVersion === 2 ? 2 : 4;
    const typeAt = infe.body + 4 + idSize + 2; // version/flags, item_ID, protection index
    if (typeAt + 4 > infe.end) return undefined;
    const id = idSize === 2 ? view.getUint16(infe.body + 4) : view.getUint32(infe.body + 4);
    const itemType = fourCC(bytes, typeAt);
    const nameStart = typeAt + 4;
    const [, contentStart] = cString(bytes, nameStart, infe.end);
    const isXmp =
      itemType === 'mime' && cString(bytes, contentStart, infe.end)[0] === XMP_CONTENT_TYPE;
    if (itemType === 'Exif' || isXmp) {
      entries.push({ id, item: { typeAt, nameStart, nameEnd: infe.end } });
    }
  }
  return entries;
};

const readUint = (view: DataView, pos: number, size: number): number | undefined => {
  if (size === 0) return 0;
  if (size === 4) return view.getUint32(pos);
  if (size !== 8) return undefined;
  const high = view.getUint32(pos);
  return high < 0x200000 ? high * 2 ** 32 + view.getUint32(pos + 4) : undefined;
};

/**
 * The file ranges of the `wanted` items in an `iloc` box; undefined when the box is malformed or
 * a wanted item's data is somewhere this cannot place (an external file, an offset into another
 * item, an extent that runs to the end).
 */
const itemExtents = (
  bytes: Uint8Array,
  iloc: IsoBox,
  idat: IsoBox | undefined,
  wanted: Set<number>
): Map<number, [number, number][]> | undefined => {
  const view = dataView(bytes);
  const version = bytes[iloc.body];
  if (version > 2 || iloc.body + 6 > iloc.end) return undefined;
  const sizes = view.getUint16(iloc.body + 4);
  const offsetSize = sizes >> 12;
  const lengthSize = (sizes >> 8) & 15;
  const baseSize = (sizes >> 4) & 15;
  const indexSize = version === 0 ? 0 : sizes & 15;
  const idSize = version < 2 ? 2 : 4;
  let pos = iloc.body + 6;
  if (pos + idSize > iloc.end) return undefined;
  const itemCount = version < 2 ? view.getUint16(pos) : view.getUint32(pos);
  pos += version < 2 ? 2 : 4;
  const result = new Map<number, [number, number][]>();
  for (let i = 0; i < itemCount; i += 1) {
    // item_ID, construction method (version 1, 2), data reference index, base offset, extent count
    const head = idSize + (version === 0 ? 0 : 2) + 2 + baseSize + 2;
    if (pos + head > iloc.end) return undefined;
    const id = idSize === 2 ? view.getUint16(pos) : view.getUint32(pos);
    pos += idSize;
    const method = version === 0 ? 0 : view.getUint16(pos) & 15;
    pos += version === 0 ? 0 : 2;
    const dataReference = view.getUint16(pos);
    pos += 2;
    const base = readUint(view, pos, baseSize);
    pos += baseSize;
    const extentCount = view.getUint16(pos);
    pos += 2;
    const extentSize = indexSize + offsetSize + lengthSize;
    if (pos + extentCount * extentSize > iloc.end) return undefined;
    if (wanted.has(id)) {
      const origin = method === 0 ? 0 : idat?.body; // method 1 is relative to the `idat` box
      if (base === undefined || dataReference !== 0 || origin === undefined || method > 1) {
        return undefined;
      }
      const extents: [number, number][] = [];
      for (let e = 0; e < extentCount; e += 1) {
        const at = pos + e * extentSize + indexSize;
        const offset = readUint(view, at, offsetSize);
        const length = readUint(view, at + offsetSize, lengthSize);
        if (offset === undefined || !length) return undefined;
        const start = origin + base + offset;
        if (start + length > bytes.length) return undefined;
        extents.push([start, start + length]);
      }
      result.set(id, extents);
    }
    pos += extentCount * extentSize;
  }
  return result;
};

const isXmpUuid = (bytes: Uint8Array, box: IsoBox): boolean =>
  box.type === 'uuid' &&
  box.body + 16 <= box.end &&
  XMP_UUID.every((byte, i) => bytes[box.body + i] === byte);

/**
 * The EXIF and XMP of a HEIF file; undefined when its boxes cannot be followed. Items without
 * an `iloc` entry have no data to remove and are left out.
 */
export const heifMetadata = (bytes: Uint8Array): HeifMetadata | undefined => {
  const top = isoBoxes(bytes, 0, bytes.length);
  if (!top) return undefined;
  const boxes = top
    .filter((box) => isXmpUuid(bytes, box))
    .map(({ start, body, end }) => ({ start, body, end }));
  const meta = top.find((box) => box.type === 'meta');
  if (!meta) return { items: [], boxes };
  if (meta.body + 4 > meta.end) return undefined;
  const children = isoBoxes(bytes, meta.body + 4, meta.end); // after version and flags
  if (!children) return undefined;
  const iinf = children.find((box) => box.type === 'iinf');
  const iloc = children.find((box) => box.type === 'iloc');
  if (!iinf || !iloc) return { items: [], boxes };
  const entries = metadataEntries(bytes, iinf);
  if (!entries) return undefined;
  if (entries.length === 0) return { items: [], boxes };
  const extents = itemExtents(
    bytes,
    iloc,
    children.find((box) => box.type === 'idat'),
    new Set(entries.map(({ id }) => id))
  );
  if (!extents) return undefined;
  const items = entries.flatMap(({ id, item }) => {
    const found = extents.get(id);
    return found ? [{ ...item, extents: found }] : [];
  });
  return { items, boxes };
};

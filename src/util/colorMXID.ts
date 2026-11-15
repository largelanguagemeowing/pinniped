// https://github.com/cloudrac3r/cadencegq/blob/master/pug/mxid.pug

function hashCode(str: string): number {
  let hash = 0;
  let i: number;
  let chr: number;
  if (str.length === 0) {
    return hash;
  }
  for (i = 0; i < str.length; i += 1) {
    chr = str.charCodeAt(i);

    hash = (hash << 5) - hash + chr;

    hash |= 0;
  }
  return Math.abs(hash);
}

export function cssColorMXID(userId: string): string {
  const colorNumber = hashCode(userId) % 8;
  return `--mx-uc-${colorNumber + 1}`;
}

export default function colorMXID(userId: string): string {
  return `var(${cssColorMXID(userId)})`;
}

// Placeholder background: the MXID color lit from the top (lightened above, slightly shaded below).
export function gradientMXID(userId: string): string {
  const base = colorMXID(userId);
  return `linear-gradient(to bottom, color-mix(in srgb, ${base}, white 39%), ${base} 55%, color-mix(in srgb, ${base}, black 9%))`;
}

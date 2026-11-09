/** Prefilled Media Embeds hosts: file hosts, Klipy media, and the OOYE (Discord) bridge. */
export const DEFAULT_MEDIA_EMBED_HOSTS = [
  'nyafiles.de',
  'pissdichal.de',
  'static.klipy.com',
  'bridge.agiadn.org',
  'tenor.com',
];

const HOST_REG =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** A bare host name such as `example.org`, lowercased. Anything else is undefined. */
export const normalizeEmbedHost = (input: string): string | undefined => {
  const host = input.trim().toLowerCase();
  return HOST_REG.test(host) ? host : undefined;
};

// `hosts` is the Media Embeds list from settings. Hosts match exactly.
export const isDirectGifUrl = (value: string, hosts: readonly string[]): boolean => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      hosts.includes(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname.toLowerCase().endsWith('.gif')
    );
  } catch {
    return false;
  }
};

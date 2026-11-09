import { normalizeEmbedHost } from './directGif';
import { isMediaAutoEmbedUrl } from './mediaAutoEmbed';

// OOYE (Out Of Your Element) serves bridged Discord media through its bridge at
// /download/discordcdn/... The bridge host differs per deployment.
const OOYE_MEDIA_PATH = '/download/discordcdn/';

export const isOoyeMediaUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.pathname.startsWith(OOYE_MEDIA_PATH)
    );
  } catch {
    return false;
  }
};

/**
 * The host of an embeddable GIF or video link that is not on the embed list yet, so
 * the user can allow it with one click. Callers pass only OOYE links, see isOoyeMediaUrl
 * and getOoyeGifVideoUrl. Undefined when there is nothing to offer.
 */
export const getHostToAllow = (value: string, hosts: readonly string[]): string | undefined => {
  let host: string | undefined;
  try {
    host = normalizeEmbedHost(new URL(value).hostname);
  } catch {
    return undefined;
  }
  if (!host || hosts.includes(host)) return undefined;
  return isMediaAutoEmbedUrl(value, [host]) ? host : undefined;
};

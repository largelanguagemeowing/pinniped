import { isDirectGifUrl } from './directGif';

const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'webm', 'ogv', 'mov', 'mkv', 'avi']);

export const isMediaAutoEmbedUrl = (value: string, hosts: readonly string[]): boolean => {
  if (isDirectGifUrl(value, hosts)) return true;
  try {
    const url = new URL(value);
    if (!(url.protocol === 'http:' || url.protocol === 'https:')) return false;
    if (!hosts.includes(url.hostname)) return false;
    const ext = url.pathname.split('.').pop()?.toLowerCase();
    return ext !== undefined && ext !== '' && VIDEO_EXTENSIONS.has(ext);
  } catch {
    return false;
  }
};

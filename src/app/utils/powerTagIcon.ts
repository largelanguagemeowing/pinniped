import { isMxcUrl } from './mxc';
import { JUMBO_EMOJI_REG } from './regex';

/**
 * Whether a role icon key is one we will show: an mxc URI (an uploaded image) or
 * emoji text. Any other string would be used as an image URL, which every viewer
 * then loads, so it is rejected. Room state is writable by admins.
 */
export const isPowerTagIconKey = (key: unknown): key is string =>
  isMxcUrl(key) || (typeof key === 'string' && JUMBO_EMOJI_REG.test(key));

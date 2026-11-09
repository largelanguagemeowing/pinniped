// An mxc URI is mxc://<server>/<mediaId>. Anything else must not be fetched as media.
const MXC_URL_REG = /^mxc:\/\/[^\s/]+\/[^\s/?#]+$/;

/**
 * Whether a value is an mxc URI. Use it wherever a field should only ever hold
 * Matrix media, such as icons, avatars, sounds and emoji keys.
 */
export const isMxcUrl = (value: unknown): value is string =>
  typeof value === 'string' && MXC_URL_REG.test(value);

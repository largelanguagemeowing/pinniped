import chroma from 'chroma-js';
import { MemberPowerTag } from '../../types/matrix/room';

// Room state is writable by admins, and a tag colour is later put into a style.
// Keep only colours chroma can parse; anything else (CSS, url(), ...) is dropped.
// The built-in defaults are code, not state, so they are not checked here.
export const sanitizeStateTag = (tag: MemberPowerTag): MemberPowerTag => {
  if (tag.color === undefined) return tag;
  const isPlainColor = typeof tag.color === 'string' && chroma.valid(tag.color);
  return isPlainColor ? tag : { ...tag, color: undefined };
};

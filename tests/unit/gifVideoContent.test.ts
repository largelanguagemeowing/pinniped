import { describe, expect, it } from 'vitest';
import { isGifVideoContent, MATRIX_GIF_PROPERTY_NAME } from '../../src/types/matrix/common';

describe('isGifVideoContent', () => {
  it('reads the marker Pinniped sends', () => {
    expect(MATRIX_GIF_PROPERTY_NAME).toBe('club.stablecat.pinniped.gif');
    expect(isGifVideoContent({ msgtype: 'm.video', [MATRIX_GIF_PROPERTY_NAME]: true })).toBe(true);
  });

  it('reads the marker on messages sent before the rename', () => {
    expect(isGifVideoContent({ msgtype: 'm.video', 'io.cinny.gif': true })).toBe(true);
  });

  it('reads the marker bridges put in info', () => {
    expect(isGifVideoContent({ msgtype: 'm.video', info: { 'fi.mau.gif': true } })).toBe(true);
  });

  it('is false for an ordinary video and for malformed markers', () => {
    expect(isGifVideoContent({ msgtype: 'm.video', info: { duration: 1000 } })).toBe(false);
    expect(isGifVideoContent({ msgtype: 'm.video', [MATRIX_GIF_PROPERTY_NAME]: 'true' })).toBe(
      false
    );
    expect(isGifVideoContent({ msgtype: 'm.video', info: null })).toBe(false);
  });
});

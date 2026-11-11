import { describe, expect, it } from 'vitest';
import { MsgType } from 'matrix-js-sdk';
import { isGifVideoContent, markGifVideo } from '../../src/types/matrix/common';

describe('isGifVideoContent', () => {
  it('marks a GIF the way bridges do, in info, keeping the rest of the content', () => {
    const video = {
      msgtype: MsgType.Video,
      body: 'cat.mp4',
      url: 'mxc://example.org/cat',
      info: { mimetype: 'video/mp4', duration: 1000 },
    };
    const marked = markGifVideo(video);
    expect(marked).toEqual({
      ...video,
      info: { ...video.info, 'fi.mau.gif': true },
    });
    expect(isGifVideoContent(marked)).toBe(true);
    expect(isGifVideoContent(video)).toBe(false);
  });

  it('reads the top-level markers earlier Pinniped versions sent', () => {
    expect(isGifVideoContent({ msgtype: 'm.video', 'club.stablecat.pinniped.gif': true })).toBe(
      true
    );
    expect(isGifVideoContent({ msgtype: 'm.video', 'io.cinny.gif': true })).toBe(true);
  });

  it('is false for an ordinary video and for malformed markers', () => {
    expect(isGifVideoContent({ msgtype: 'm.video', info: { duration: 1000 } })).toBe(false);
    expect(isGifVideoContent({ msgtype: 'm.video', 'club.stablecat.pinniped.gif': 'true' })).toBe(
      false
    );
    expect(isGifVideoContent({ msgtype: 'm.video', info: { 'fi.mau.gif': 'true' } })).toBe(false);
    expect(isGifVideoContent({ msgtype: 'm.video', info: null })).toBe(false);
  });
});

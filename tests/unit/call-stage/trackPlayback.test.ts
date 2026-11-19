import { describe, expect, it } from 'vitest';
import { Track } from 'livekit-client';

import {
  audioTrackKind,
  type ListenerAudio,
  SOUNDBOARD_TRACK_NAME,
  trackPlayback,
} from '../../../src/app/features/call/stage/audio/trackPlayback';

const listener = (overrides: Partial<ListenerAudio> = {}): ListenerAudio => ({
  userVolumes: {},
  soundboardVolume: 1,
  mutedSoundboards: [],
  deafened: false,
  ...overrides,
});

describe('audioTrackKind', () => {
  it('tells soundboard sounds by their track name, whatever the source', () => {
    expect(audioTrackKind(Track.Source.Unknown, SOUNDBOARD_TRACK_NAME)).toBe('soundboard');
    expect(audioTrackKind(Track.Source.Microphone, SOUNDBOARD_TRACK_NAME)).toBe('soundboard');
  });

  it('tells shared-screen audio by its source', () => {
    expect(audioTrackKind(Track.Source.ScreenShareAudio, 'screen')).toBe('screenShare');
  });

  it('treats everything else as a voice', () => {
    expect(audioTrackKind(Track.Source.Microphone, 'mic')).toBe('voice');
    expect(audioTrackKind(Track.Source.Unknown, 'other')).toBe('voice');
  });
});

describe('trackPlayback', () => {
  it("plays a voice at the listener's level for that participant", () => {
    const settings = listener({ userVolumes: { '@a:x': 1.5, '@b:x': 0 } });
    expect(trackPlayback('voice', '@a:x', settings)).toEqual({ level: 1.5, muted: false });
    expect(trackPlayback('voice', '@b:x', settings).level).toBe(0);
    expect(trackPlayback('voice', '@c:x', settings).level).toBe(1);
    expect(trackPlayback('voice', undefined, settings).level).toBe(1);
  });

  it('plays soundboard sounds at the soundboard volume, not the participant level', () => {
    const settings = listener({ userVolumes: { '@a:x': 2 }, soundboardVolume: 0.3 });
    expect(trackPlayback('soundboard', '@a:x', settings)).toEqual({ level: 0.3, muted: false });
  });

  it("silences a participant's soundboard the listener muted, and only theirs", () => {
    const settings = listener({ soundboardVolume: 0.8, mutedSoundboards: ['@a:x'] });
    expect(trackPlayback('soundboard', '@a:x', settings).level).toBe(0);
    expect(trackPlayback('soundboard', '@b:x', settings).level).toBe(0.8);
  });

  it('leaves shared-screen audio to its stream volume: no participant level, no deafen', () => {
    const settings = listener({ userVolumes: { '@a:x': 0 }, deafened: true });
    expect(trackPlayback('screenShare', '@a:x', settings)).toEqual({ level: 1, muted: false });
  });

  it('deafening mutes voices and soundboard sounds', () => {
    const settings = listener({ deafened: true });
    expect(trackPlayback('voice', '@a:x', settings).muted).toBe(true);
    expect(trackPlayback('soundboard', '@a:x', settings).muted).toBe(true);
  });
});

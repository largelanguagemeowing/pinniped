import { Track } from 'livekit-client';

/** The name the call core publishes soundboard sounds under (engine/livekit/soundboard.ts). */
export const SOUNDBOARD_TRACK_NAME = 'soundboard';

/** What a remote audio track carries, which decides how it plays for this listener. */
export type AudioTrackKind = 'voice' | 'soundboard' | 'screenShare';

export const audioTrackKind = (source: Track.Source, trackName: string): AudioTrackKind => {
  if (trackName === SOUNDBOARD_TRACK_NAME) return 'soundboard';
  if (source === Track.Source.ScreenShareAudio) return 'screenShare';
  return 'voice';
};

/** This listener's own audio choices. */
export interface ListenerAudio {
  /** Voice level per Matrix user, 0 when muted; absent means 1. Up to 2. */
  userVolumes: Record<string, number>;
  /** How loud soundboard sounds are, 0-1. */
  soundboardVolume: number;
  /** Matrix users whose soundboard sounds this listener does not hear. */
  mutedSoundboards: string[];
  deafened: boolean;
}

export interface TrackPlayback {
  /**
   * The gain this client applies: 0 silent, 1 unchanged, up to 2. Shared-screen audio stays at
   * 1: the stream's own volume control (the participant's track volume) sets it.
   */
  level: number;
  /** Whether the server should stop sending the track: nothing from the call is heard. */
  muted: boolean;
}

/**
 * How a remote audio track plays. Soundboard sounds are sent at full level and take the
 * listener's soundboard volume (or silence, for a muted soundboard); voices take the
 * listener's level for that participant. Deafening silences both, but leaves shared-screen
 * audio playing.
 */
export function trackPlayback(
  kind: AudioTrackKind,
  userId: string | undefined,
  listener: ListenerAudio
): TrackPlayback {
  switch (kind) {
    case 'soundboard':
      return {
        level:
          userId !== undefined && listener.mutedSoundboards.includes(userId)
            ? 0
            : listener.soundboardVolume,
        muted: listener.deafened,
      };
    case 'screenShare':
      return { level: 1, muted: false };
    case 'voice':
      return {
        level: (userId !== undefined ? listener.userVolumes[userId] : undefined) ?? 1,
        muted: listener.deafened,
      };
  }
}

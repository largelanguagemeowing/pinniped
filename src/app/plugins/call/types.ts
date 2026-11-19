export const screenShareResolutions = [
  { id: '480p', name: '480p' },
  { id: '720p', name: '720p' },
  { id: '1080p', name: '1080p' },
  { id: '1440p', name: '1440p' },
  { id: 'source', name: 'Source' },
] as const;
export const screenShareFrameRates = [15, 30, 60] as const;

export type ScreenShareResolution = (typeof screenShareResolutions)[number]['id'];
export type ScreenShareFps = (typeof screenShareFrameRates)[number];
export type ScreenShareQuality = { resolution: ScreenShareResolution; fps: ScreenShareFps };

/** The label of the virtual microphone the desktop app makes on Linux (electron/screenshare-audio.cjs). */
export const SCREEN_SHARE_AUDIO_DEVICE = 'Pinniped Screen Share Audio';

/** Voice level per participant as the call applies it: muted participants are at 0. */
export const getCallUserVolumes = (settings: {
  callUserVolumes: Record<string, number>;
  callMutedUsers: string[];
}): Record<string, number> => {
  const volumes = { ...settings.callUserVolumes };
  settings.callMutedUsers.forEach((userId) => {
    volumes[userId] = 0;
  });
  return volumes;
};

import { VoiceTuning } from './voiceTuning';

export enum ElementCallIntent {
  StartCall = 'start_call',
  JoinExisting = 'join_existing',
  StartCallVoice = 'start_call_voice',
  JoinExistingVoice = 'join_existing_voice',
  StartCallDM = 'start_call_dm',
  JoinExistingDM = 'join_existing_dm',
  StartCallDMVoice = 'start_call_dm_voice',
  JoinExistingDMVoice = 'join_existing_dm_voice',
}

export type ElementCallThemeKind = 'light' | 'dark';

export type ElementMediaStatePayload = {
  audio_enabled?: boolean;
  video_enabled?: boolean;
};
export type ElementMediaStateDetail = {
  data?: ElementMediaStatePayload;
};

export enum ElementWidgetActions {
  JoinCall = 'io.element.join',
  HangupCall = 'im.vector.hangup',
  Close = 'io.element.close',
  DeviceMute = 'io.element.device_mute',
  /** Fork: sets the call audio preferences, see {@link ElementCallSettings}. */
  CallSettings = 'io.cinny.call_settings',
  /** Fork: start a screen share with the chosen quality and audio, see {@link ScreenShareStart}. */
  ScreenShare = 'io.cinny.screenshare',
  /** Fork, from the widget: a call sound to play, see {@link CallSoundCommand}. */
  CallSound = 'io.cinny.call_sound',
  /** Fork: play or stop a soundboard sound in the call, see {@link SoundboardCommand}. */
  Soundboard = 'io.cinny.soundboard',
  /** Fork, from the widget: a CallStatsSample once a second. */
  CallStats = 'io.cinny.call_stats',
  /** Fork, from the widget: who is speaking, muted or sharing, whenever that changes. */
  CallActivity = 'io.cinny.call_activity',
  /** Fork, from the widget: a non-fatal call problem (or none), whenever that changes. */
  CallError = 'io.cinny.call_error',
}

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
/** Screen share quality; the call widget takes it as `<resolution>:<fps>`. */
export type ScreenShareQuality = { resolution: ScreenShareResolution; fps: ScreenShareFps };

/** The label of the virtual microphone the desktop app makes on Linux (electron/screenshare-audio.cjs). */
export const SCREEN_SHARE_AUDIO_DEVICE = 'Pinniped Screen Share Audio';

/**
 * What the call widget shares as a screen share's audio: `off`, `display` (what the browser or
 * Windows offers with the capture) or `device:<label>` (a microphone to publish instead).
 */
export const screenShareAudioSource = (enabled: boolean): string => {
  if (!enabled) return 'off';
  return window.cinnyDesktop?.screenShareAudio ? `device:${SCREEN_SHARE_AUDIO_DEVICE}` : 'display';
};

/** Call audio preferences; an empty device id is the system default. */
export type ElementCallSettings = {
  denoise: boolean;
  autoGain: boolean;
  voiceGate: boolean;
  voiceGateAuto: boolean;
  /** 0-1: how loud speech must be to open the gate when not automatic. */
  voiceGateThreshold: number;
  voiceTuning: VoiceTuning;
  simulcast: boolean;
  /** `<resolution>:<fps>`, e.g. `720p:60`. */
  screenShare: string;
  /** Where a screen share's audio comes from, see {@link screenShareAudioSource}. */
  screenShareAudio: string;
  /** Volume of the call's own sounds, 0-1. */
  soundVolume: number;
  /** How loud soundboard sounds are for this client, 0-1. */
  soundboardVolume: number;
  /** Per participant (Matrix user ID): voice level 0-1, 0 when muted. Absent means 1. */
  userVolumes: Record<string, number>;
  /** Participants whose soundboard sounds are muted for this client. */
  mutedSoundboards: string[];
  audioInput: string;
  audioOutput: string;
};

/** Start a screen share with these options; `quality` is `<resolution>:<fps>`, `audio` a screenShareAudioSource value. */
export type ScreenShareStart = { quality: string; audio: string };

/** A sound the call widget asks the client to play. `loop` repeats until `stop` with its id; `intro` plays first. */
export type CallSoundCommand =
  | { op: 'play'; sound: string }
  | { op: 'loop'; sound: string; intro?: string; id: number }
  | { op: 'stop'; id: number };

/** `url` is a blob: URL of the audio, which the same-origin call widget can read. */
export type SoundboardCommand = { op: 'play'; url: string; mode?: 'cut' | 'add' } | { op: 'stop' };

/** Voice level per participant as the widget applies it: muted participants are at 0. */
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

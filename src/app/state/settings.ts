import { atom } from 'jotai';
import { VoiceTuning } from '../plugins/call/voiceTuning';
import type { ScreenShareQuality } from '../plugins/call/types';
import type { SoundKind } from '../sound/bundles';
import { DEFAULT_MEDIA_EMBED_HOSTS } from '../utils/directGif';

const STORAGE_KEY = 'settings';
export type DateFormat =
  'D MMM YYYY' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY/MM/DD' | 'YYYY-MM-DD' | '';
export type MessageSpacing = '0' | '100' | '200' | '300' | '400' | '500';
export enum MessageLayout {
  Modern = 0,
  Compact = 1,
  Bubble = 2,
}

export interface Settings {
  themeId?: string;
  useSystemTheme: boolean;
  lightThemeId?: string;
  darkThemeId?: string;
  monochromeMode?: boolean;
  lowAnimationMode?: boolean;
  twitterEmoji: boolean;
  pageZoom: number;
  hideActivity: boolean;

  // MSC4320: impersonate Discord's local RPC pipe and publish activity as the
  // user's rich presence (desktop only, off by default).
  publishRichPresence: boolean;

  // Call microphone: DeepFilterNet 3 noise suppression, applied inside the call widget.
  callDenoise: boolean;
  /** The browser's automatic gain control on the microphone, ahead of everything else. */
  callAutoGain: boolean;
  // Only send the microphone while it hears speech (applied inside the call widget, after the
  // denoiser). `Auto` follows the room's noise floor; otherwise `Threshold` (0-1) is the level.
  callVoiceGate: boolean;
  callVoiceGateAuto: boolean;
  callVoiceGateThreshold: number;
  // Fine tuning of the gate and the speaking indicator; stored partially, see withDefaultTuning.
  callVoiceTuning: Partial<VoiceTuning>;
  // Publish video as several quality layers (off: one high-quality stream).
  callSimulcast: boolean;
  // Screen share preset, picked when a share starts; see ScreenShareQuality.
  callScreenShare: ScreenShareQuality;
  // Share the computer's audio with a screen share.
  callScreenShareAudio: boolean;
  // Call devices, as enumerateDevices ids; '' = system default.
  callAudioInput: string;
  callAudioOutput: string;
  // Desktop global shortcuts for call actions, by action id (see features/call-hotkeys). Empty: none.
  callHotkeys: Partial<Record<'mute' | 'deafen', string>>;

  isPeopleDrawer: boolean;
  showPresenceInMemberList: boolean;
  showPresenceInDMList: boolean;
  /** Preferred emoji skin tone: 0 is the default yellow, 1-5 are light to dark. */
  emojiSkinTone: number;
  memberSortFilterIndex: number;
  messageLayout: MessageLayout;
  messageSpacing: MessageSpacing;
  hideMembershipEvents: boolean;
  hideNickAvatarEvents: boolean;
  mediaAutoLoad: boolean;
  urlPreview: boolean;
  encUrlPreview: boolean;
  // Optional third-party preview server (stablecat preview tokens). Empty = own homeserver.
  urlPreviewServer: string;
  urlPreviewServerToken: string;
  /** Hosts whose GIF and video links are embedded in the timeline. */
  mediaEmbedHosts: string[];
  showHiddenEvents: boolean;
  legacyUsernameColor: boolean;

  showNotifications: boolean;
  isNotificationSounds: boolean;
  notificationSoundBundle: string;
  // Legacy group switch for the event sounds; now only the default of those without their own.
  eventSounds: boolean;
  // Per-sound overrides (see SOUND_TOGGLES); a sound without one uses its default.
  soundToggles: Partial<Record<SoundKind, boolean>>;
  // Volume of the bundle sounds (ringing, messages, invites, events) and the call's own, 0-1.
  soundVolume: number;
  // Soundboard: how loud sounds you play are (to the call and to you), and the last played.
  soundboardVolume: number;
  soundboardRecent: string[];
  // Per participant, for you only (Matrix user IDs): how loud their voice is (0-1, default 1),
  // whether it is muted, and whether their soundboard sounds are muted.
  callUserVolumes: Record<string, number>;
  callMutedUsers: string[];
  callSoundboardMutedUsers: string[];

  hour24Clock: boolean;
  dateFormatString: string;

  autoJoinSpaceRooms: boolean;
  ignoreSpaceAutoJoin: boolean;
  idleDetection: boolean;

  developerTools: boolean;
  /** Message range export, offered under Developer Tools. */
  messageExport: boolean;

  onlySignedDevices: boolean;
}

const defaultSettings: Settings = {
  themeId: undefined,
  useSystemTheme: true,
  lightThemeId: undefined,
  darkThemeId: undefined,
  monochromeMode: false,
  lowAnimationMode: false,
  twitterEmoji: true,
  pageZoom: 100,
  hideActivity: false,

  publishRichPresence: false,

  callDenoise: false,
  callAutoGain: false,
  callVoiceGate: false,
  callVoiceGateAuto: true,
  callVoiceGateThreshold: 0.45,
  callVoiceTuning: {},
  callSimulcast: false,
  callScreenShare: { resolution: '720p', fps: 60 },
  callScreenShareAudio: true,
  callAudioInput: '',
  callAudioOutput: '',
  callHotkeys: {},

  isPeopleDrawer: true,
  showPresenceInMemberList: true,
  showPresenceInDMList: true,
  emojiSkinTone: 0,
  memberSortFilterIndex: 0,
  messageLayout: 0,
  messageSpacing: '400',
  hideMembershipEvents: false,
  hideNickAvatarEvents: true,
  mediaAutoLoad: true,
  urlPreview: true,
  encUrlPreview: false,
  urlPreviewServer: '',
  urlPreviewServerToken: '',
  mediaEmbedHosts: [...DEFAULT_MEDIA_EMBED_HOSTS],
  showHiddenEvents: false,
  legacyUsernameColor: false,

  showNotifications: true,
  isNotificationSounds: true,
  notificationSoundBundle: 'default',
  eventSounds: false,
  soundToggles: {},
  soundVolume: 0.6,
  soundboardVolume: 1,
  soundboardRecent: [],
  callUserVolumes: {},
  callMutedUsers: [],
  callSoundboardMutedUsers: [],

  hour24Clock: false,
  dateFormatString: 'D MMM YYYY',

  autoJoinSpaceRooms: false,
  ignoreSpaceAutoJoin: false,
  idleDetection: true,

  developerTools: false,
  messageExport: false,

  onlySignedDevices: false,
};

/** Sound bundles that were removed, and the bundle their users move to. */
const MIGRATED_SOUND_BUNDLES: Record<string, string> = {
  skype: 'skype-classic-7x',
  'skype-classic': 'skype-classic-7x',
};

export const getSettings = () => {
  const settings = localStorage.getItem(STORAGE_KEY);
  if (settings === null) return defaultSettings;
  const saved = JSON.parse(settings) as Settings;
  return {
    ...defaultSettings,
    ...saved,
    notificationSoundBundle:
      MIGRATED_SOUND_BUNDLES[saved.notificationSoundBundle] ?? saved.notificationSoundBundle,
  };
};

export const setSettings = (settings: Settings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

const baseSettings = atom<Settings>(getSettings());
export const settingsAtom = atom<Settings, [Settings], undefined>(
  (get) => get(baseSettings),
  (get, set, update) => {
    set(baseSettings, update);
    setSettings(update);
  }
);

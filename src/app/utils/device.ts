// Fork-only: distinguishes the Electron desktop build from the web build.
// The desktop preload exposes `window.pinnipedDesktop` (see electron/preload.cjs).

// A Discord `SET_ACTIVITY` payload (the fields we read), as normalised by the
// main-process impersonator (see electron/rich-presence.cjs). `null` = clear.
export type DiscordRichPresenceActivity = {
  type?: number;
  name?: string;
  details?: string;
  state?: string;
  application_id?: string;
  timestamps?: { start?: number; end?: number };
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
};

export type RichPresenceBridgeStartResult =
  { ok: true; path: string; index: number } | { ok: false; error: string };

export type ScreenSharePickerSource = {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  /** An image data URL. */
  thumbnail: string;
  icon: string | null;
};

export type AutostartState = { enabled: boolean; minimized: boolean };

declare global {
  interface Window {
    pinnipedDesktop?: {
      platform: string;
      versions: { electron: string; chrome: string; node: string };
      showWindow?: () => void;
      setBadgeCount?: (count: number, overlayPng?: string, hasUnread?: boolean) => void;
      /** Gives the main process the token to add to the homeserver's media requests. */
      setMediaAuth?: (baseUrl?: string, accessToken?: string) => void;
      /** Whether the app launches at login, and whether it then starts minimized. */
      getAutostart?: () => Promise<AutostartState>;
      /** Resolves to the resulting state. */
      setAutostart?: (enabled: boolean, minimized: boolean) => Promise<AutostartState>;
      getSystemIdleTime?: () => Promise<number>;
      /**
       * Other applications' audio, for screen shares: on Linux a virtual microphone, on Windows
       * PCM chunks from `onPcm` (16-bit stereo 48 kHz), which the page hands to the call widget.
       */
      screenShareAudio?: {
        prepare: () => Promise<{ ok: true; label: string } | { ok: false; error: string }>;
        /**
         * `output` is the label of the playback device the app uses, empty for the system default.
         * `exclude` lists programs (executable file names) that are never shared; Windows only.
         */
        link: (active: boolean, output?: string, exclude?: string[]) => Promise<void>;
        release: () => Promise<void>;
        /** Windows only: shows the helper's console window with debug logging, or hides it again. */
        setConsole?: (enabled: boolean) => void;
        /** Windows only: calls `cb` with each chunk while linked. Returns the unsubscribe. */
        onPcm?: (cb: (chunk: Uint8Array) => void) => () => void;
      };
      /**
       * Windows only, where Chromium has no screen picker: the screens and windows a share can
       * capture, and what the next share captures. Listing builds thumbnails, which takes a moment.
       */
      screenSharePicker?: {
        list: () => Promise<ScreenSharePickerSource[]>;
        /** A source id from `list`, or null to forget the choice. */
        select: (id: string | null) => void;
      };
      /** WebRTC bandwidth-estimation field trials; a change applies after `restart`. */
      webrtcTuning?: {
        get: () => Promise<boolean>;
        set: (enabled: boolean) => Promise<void>;
        restart: () => Promise<void>;
      };
      /** Linux desktop: global shortcuts through the portal helper. Resolves when the desktop answers. */
      bindHotkeys?: (
        shortcuts: { id: string; description: string; trigger?: string }[]
      ) => Promise<{ ok: boolean; error?: string | null }>;
      /** Calls `cb` with the id of each bound shortcut when it is pressed. Returns the unsubscribe. */
      onHotkey?: (cb: (id: string) => void) => () => void;
      /**
       * What to do when the window is about to close or reload during a call: leave it, so the
       * membership ends at once instead of timing out. Returns the unregister.
       */
      onLeaveCallRequest?: (handler: () => Promise<unknown>) => () => void;
      supportsRichPresenceBridge?: true;
      startRichPresenceBridge?: () => Promise<RichPresenceBridgeStartResult>;
      stopRichPresenceBridge?: () => Promise<void>;
      onRichPresenceActivity?: (
        cb: (activity: DiscordRichPresenceActivity | null) => void
      ) => () => void;
    };
  }
}

export const isDesktop = (): boolean => typeof window.pinnipedDesktop !== 'undefined';

// Matrix device display name shown in the account's sessions list
export const getDeviceDisplayName = (): string =>
  `${isDesktop() ? 'Pinniped Desktop' : 'Pinniped Web'} (${__APP_COMMIT__})`;

// package.json version plus the commit this bundle was built from
export const APP_VERSION = `v${__APP_VERSION__} (${__APP_COMMIT__})`;

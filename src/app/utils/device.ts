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
      /** Linux only: a virtual microphone carrying other applications' audio, for screen shares. */
      screenShareAudio?: {
        prepare: () => Promise<{ ok: true; label: string } | { ok: false; error: string }>;
        /** `output` is the label of the playback device the app uses, empty for the system default. */
        link: (active: boolean, output?: string) => Promise<void>;
        release: () => Promise<void>;
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
export const APP_VERSION = `v4.12.6 (${__APP_COMMIT__})`;

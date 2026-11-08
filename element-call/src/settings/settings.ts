/*
Copyright 2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import { BehaviorSubject } from "rxjs";

import { defaultVoiceTuning, type VoiceTuning } from "../livekit/voiceTuning";
import { PosthogAnalytics } from "../analytics/PosthogAnalytics";
import { type Behavior } from "../state/Behavior";
import { useBehavior } from "../useBehavior";

export class Setting<T> {
  public constructor(
    key: string,
    public readonly defaultValue: T,
  ) {
    this.key = `matrix-setting-${key}`;

    const storedValue = localStorage.getItem(this.key);
    let initialValue = defaultValue;
    if (storedValue !== null) {
      try {
        initialValue = JSON.parse(storedValue);
      } catch (e) {
        logger.warn(
          `Invalid value stored for setting ${key}: ${storedValue}.`,
          e,
        );
      }
    }

    this._value$ = new BehaviorSubject(initialValue);
    this.value$ = this._value$;
    this._lastUpdateReason$ = new BehaviorSubject<string | null>(null);
    this.lastUpdateReason$ = this._lastUpdateReason$;
  }

  private readonly key: string;

  private readonly _value$: BehaviorSubject<T>;
  private readonly _lastUpdateReason$: BehaviorSubject<string | null>;
  public readonly value$: Behavior<T>;
  public readonly lastUpdateReason$: Behavior<string | null>;

  public readonly setValue = (value: T, reason?: string): void => {
    this._value$.next(value);
    this._lastUpdateReason$.next(reason ?? null);
    // JSON.stringify(undefined) is undefined, which would be stored as the text "undefined".
    if (value === undefined) localStorage.removeItem(this.key);
    else localStorage.setItem(this.key, JSON.stringify(value));
  };
  public readonly getValue = (): T => {
    return this._value$.getValue();
  };
}

/**
 * React hook that returns a settings's current value and a setter.
 */
export function useSetting<T>(setting: Setting<T>): [T, (value: T) => void] {
  return [useBehavior(setting.value$), setting.setValue];
}

// null = undecided
export const optInAnalytics = new Setting<boolean | null>(
  "opt-in-analytics",
  null,
);
// TODO: This setting can be disabled. Work out an approach to disableable
// settings thats works for Observables in addition to React.
export const useOptInAnalytics = (): [
  boolean | null,
  ((value: boolean | null) => void) | null,
] => {
  const setting = useSetting(optInAnalytics);
  return PosthogAnalytics.instance.isEnabled() ? setting : [false, null];
};

export const developerMode = new Setting("developer-settings-tab", false);

export const duplicateTiles = new Setting("duplicate-tiles", 0);

export const debugTileLayout = new Setting("debug-tile-layout", false);

export const showConnectionStats = new Setting<boolean>(
  "show-connection-stats",
  false,
);

export const audioInput = new Setting<string | undefined>(
  "audio-input",
  undefined,
);
export const audioOutput = new Setting<string | undefined>(
  "audio-output",
  undefined,
);
export const videoInput = new Setting<string | undefined>(
  "video-input",
  undefined,
);

export const backgroundBlur = new Setting<boolean>("background-blur", false);

export const denoiseMode = new Setting<"off" | "deepfilternet">(
  "denoise-mode",
  "off",
);

/**
 * Only send the microphone while it is picking up speech. The gate sits after
 * the denoiser, which keeps running either way so it keeps adapting to the room.
 */
export const voiceGate = new Setting<boolean>("voice-gate", false);

/** Fine tuning of the voice gate and speaking indicator, set as a whole by the client. */
export const voiceTuning = new Setting<VoiceTuning>(
  "voice-tuning",
  defaultVoiceTuning,
);

/** Whether the voice gate follows the room's noise floor instead of using the fixed threshold. */
export const voiceGateAuto = new Setting<boolean>("voice-gate-auto", true);

/** How loud speech must be to open the voice gate, 0-1 (see voiceGateLevels); higher needs louder. */
export const voiceGateThreshold = new Setting<number>(
  "voice-gate-threshold",
  0.45,
);

/**
 * Whether video is published as several quality layers. Off sends one
 * high-quality stream; applies to video published afterwards.
 */
export const videoSimulcast = new Setting<boolean>("video-simulcast", false);

/** Screen share quality as `<resolution>:<fps>` (see parseScreenShareQuality), chosen by the client. */
export const screenShareQuality = new Setting<string>(
  "screen-share-quality",
  "720p:60",
);

/**
 * Where a screen share's audio comes from, chosen by the client: "off", "display" (the audio the
 * browser or OS offers with the capture) or "device:<label>" (a microphone published as the
 * share's audio instead, which the desktop app uses on Linux where capture has no system audio).
 */
export const screenShareAudio = new Setting<string>(
  "screen-share-audio",
  "display",
);

/**
 * How loud soundboard sounds are for this listener, 0-1: those of other participants and the
 * local copy of your own. Sounds go out at full level, so each listener sets their own.
 */
export const soundboardVolume = new Setting<number>("soundboard-volume", 1);

/**
 * Names of the call's own sounds (waiting, waitingIntro, join, left, decline, timeout) the
 * embedding client has switched off; they are not played at all.
 */
export const mutedSounds = new Setting<string[]>("muted-sounds", []);

/**
 * How loud each participant's voice is for this listener (Matrix user ID to 0-1; absent
 * means 1, a muted participant is at 0). Owned by the embedding client.
 */
export const userVolumes = new Setting<Record<string, number>>(
  "user-volumes",
  {},
);

/** Participants (Matrix user IDs) whose soundboard sounds this listener has muted. */
export const mutedSoundboards = new Setting<string[]>("muted-soundboards", []);

export const showHandRaisedTimer = new Setting<boolean>(
  "hand-raised-show-timer",
  false,
);

export const showReactions = new Setting<boolean>("reactions-show", true);

export const playReactionsSound = new Setting<boolean>(
  "reactions-play-sound",
  true,
);

export const soundEffectVolume = new Setting<number>(
  "sound-effect-volume",
  0.6,
);

export const muteAllAudio = new Setting<boolean>("mute-all-audio", false);

export const alwaysShowSelf = new Setting<boolean>("always-show-self", true);

export const alwaysShowIphoneEarpiece = new Setting<boolean>(
  "always-show-iphone-earpiece",
  false,
);

export const enableExtendedLivekitLogs = new Setting<boolean>(
  "extended-livekit-logs",
  false,
);

export enum MatrixRTCMode {
  Legacy = "legacy",
  Compatibility = "compatibility",
  /** This implies using
   *  - sticky events
   *  - hashed RTC backend identity
   *  - the new endpoint for the jwt token on the local membership (remote memberships will always try the new jwt endpoint first -> then the legacy one)
   *  - use the hashed identity for the local membership
   */
  Matrix_2_0 = "matrix_2_0",
}

// Pinniped: Compatibility (multi-SFU) so each member publishes through their own
// homeserver's focus. Legacy publishes on the oldest member's focus, whose JWT
// service hands members of other homeservers a receive-only token.
export const matrixRTCMode = new Setting<MatrixRTCMode>(
  "matrix-rtc-mode",
  MatrixRTCMode.Compatibility,
);

export const customLivekitUrl = new Setting<string | null>(
  "custom-livekit-url",
  null,
);

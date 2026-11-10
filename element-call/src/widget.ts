/*
Copyright 2022-2024 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { logger } from "matrix-js-sdk/lib/logger";
import {
  EventType,
  createRoomWidgetClient,
  type MatrixClient,
} from "matrix-js-sdk";
import {
  WidgetApi,
  MatrixCapabilities,
  PostmessageTransport,
  WidgetApiToWidgetAction,
} from "matrix-widget-api";

import type { IWidgetApiRequest } from "matrix-widget-api";

// matrix-widget-api console.logs every message it sends, which floods the
// console (call stats alone are one per second). Send without the log.
(
  PostmessageTransport.prototype as unknown as {
    sendInternal(message: IWidgetApiRequest): void;
  }
).sendInternal = function (this: PostmessageTransport, message): void {
  (
    this as unknown as {
      transportWindow: Window;
      targetOrigin: string;
    }
  ).transportWindow.postMessage(
    message,
    (this as unknown as { targetOrigin: string }).targetOrigin,
  );
};
import { LazyEventEmitter } from "./LazyEventEmitter";
import { getUrlParams } from "./UrlParams";
import { installBitrateHints } from "./livekit/bitrateHints";
import {
  type SoundboardCommand,
  soundboardCommand$,
} from "./livekit/soundboard";
import { screenShareStart$ } from "./livekit/screenShareStart";
import { applyHostCallControl, reportUserActivity } from "./hostControl";
import { callSoundCommand$ } from "./livekit/callSounds";
import {
  audioInput,
  audioOutput,
  denoiseMode,
  autoGain,
  voiceGate,
  voiceGateAuto,
  voiceGateThreshold,
  voiceTuning,
  screenShareQuality,
  screenShareAudio,
  soundEffectVolume,
  soundboardVolume,
  mutedSounds,
  userVolumes,
  mutedSoundboards,
  videoSimulcast,
} from "./settings/settings";
import { Config } from "./config/Config";
import { normalizeVoiceTuning } from "./livekit/voiceTuning";
import { ElementCallReactionEventType } from "./reactions";

// Subset of the actions in element-web
export enum ElementWidgetActions {
  JoinCall = "io.element.join",
  HangupCall = "im.vector.hangup",
  Close = "io.element.close",
  // toWidget (fork): the client sets the call audio preferences, data
  // `{ denoise?, autoGain?, voiceGate?, voiceGateAuto?, voiceGateThreshold?, voiceTuning?, simulcast?, screenShare?, screenShareAudio?, soundVolume?, soundboardVolume?, userVolumes?, mutedSoundboards?, mutedSounds?, audioInput?, audioOutput? }`.
  // An empty device ID means the system default.
  CallSettings = "club.stablecat.pinniped.call_settings",
  // toWidget (fork): start a screen share with the given options, see ScreenShareStart
  ScreenShare = "club.stablecat.pinniped.screenshare",
  // fromWidget (fork): a call sound for the client to play, see CallSoundCommand
  CallSound = "club.stablecat.pinniped.call_sound",
  // toWidget (fork): play or stop a soundboard sound, see SoundboardCommand
  Soundboard = "club.stablecat.pinniped.soundboard",
  // fromWidget (fork): a CallStatsSample once a second while in a call
  CallStats = "club.stablecat.pinniped.call_stats",
  // fromWidget (fork): who is speaking, muted or sharing their screen, whenever that
  // changes; data `{ speaking: string[], muted: string[], screenSharing: string[] }`
  CallActivity = "club.stablecat.pinniped.call_activity",
  // fromWidget (fork): a non-fatal problem with the call, whenever it changes;
  // data `{ error: { code, title, message } | null }`
  CallError = "club.stablecat.pinniped.call_error",
  // fromWidget (fork): open the client's profile card for a participant; data `{ userId }`
  ViewProfile = "club.stablecat.pinniped.view_profile",
  // toWidget (fork): the client's own call controls, see HostCallControl
  CallControl = "club.stablecat.pinniped.call_control",
  // fromWidget (fork): the state those controls show, see CallViewState
  CallView = "club.stablecat.pinniped.call_view",
  // fromWidget (fork): the user moved the pointer or typed inside the call view;
  // at most once a second, no data
  UserActivity = "club.stablecat.pinniped.user_activity",
  // This can be sent as from or to widget
  // fromWidget: updates the client about the current device mute state
  // toWidget: the client requests a specific device mute configuration
  //   The reply will always be the resulting configuration
  //   It is possible to sent an empty configuration to retrieve the current values or
  //   just one of the fields to update that particular value
  //   An undefined field means that EC will keep the mute state as is.
  //   -> this will allow the client to only get the current state
  //
  // The data of the widget action request and the response are:
  // {
  //   audio_enabled?: boolean,
  //   video_enabled?: boolean
  // }
  DeviceMute = "io.element.device_mute",
}

export interface JoinCallData {
  audioInput: string | null;
  videoInput: string | null;
}

export interface WidgetHelpers {
  api: WidgetApi;
  lazyActions: LazyEventEmitter;
  client: Promise<MatrixClient>;
}

/**
 * A point of access to the widget API, if the app is running as a widget. This
 * is initialized with `initializeWidget`. This should happen at the top level because the widget messaging
 * needs to be set up ASAP on load to ensure it doesn't miss any requests.
 */
export let widget: WidgetHelpers | null = null;

/**
 * Should be called as soon as possible on app start. (In the initilizer before react)
 */
// this needs to be a seperate call and cannot be done on import to allow us to spy on methods in here before
// execution.
export const initializeWidget = (
  rtcApplication: string = "m.call",
  sendRoomEvents = false,
): void => {
  try {
    const {
      widgetId,
      parentUrl,
      roomId,
      userId,
      deviceId,
      baseUrl,
      e2eEnabled,
      allowIceFallback,
      denoise,
      autoGain: autoGainParam,
      voiceGate: voiceGateParam,
      voiceGateAuto: voiceGateAutoParam,
      voiceTuning: voiceTuningParam,
      voiceGateThreshold: voiceGateThresholdParam,
      simulcast,
      screenShare,
      screenShareAudio: screenShareAudioParam,
      soundVolume,
      soundboardVolume: soundboardVolumeParam,
      mutedSounds: mutedSoundsParam,
      userVolumes: userVolumesParam,
      mutedSoundboards: mutedSoundboardsParam,
      audioInput: audioInputId,
      audioOutput: audioOutputId,
    } = getUrlParams();

    if (!roomId) throw new Error("Room ID must be supplied");
    if (!userId) throw new Error("User ID must be supplied");
    if (!deviceId) throw new Error("Device ID must be supplied");
    if (!baseUrl) throw new Error("Base URL must be supplied");
    if (widgetId && parentUrl) {
      const parentOrigin = new URL(parentUrl).origin;
      logger.info("Widget API is available");
      installBitrateHints();
      const api = new WidgetApi(widgetId, parentOrigin);
      api.requestCapability(MatrixCapabilities.AlwaysOnScreen);
      api.requestCapability(MatrixCapabilities.MSC4039DownloadFile);
      // Call sounds are played by the client, which chooses them: the widget only reports them.
      callSoundCommand$.subscribe((command) => {
        api.transport
          .send(ElementWidgetActions.CallSound, command)
          .catch(() => undefined);
      });

      // Set up the lazy action emitter, but only for select actions that we
      // intend for the app to handle
      const lazyActions = new LazyEventEmitter();
      [
        WidgetApiToWidgetAction.ThemeChange,
        ElementWidgetActions.JoinCall,
        ElementWidgetActions.HangupCall,
        ElementWidgetActions.DeviceMute,
      ].forEach((action) => {
        api.on(`action:${action}`, (ev: CustomEvent<IWidgetApiRequest>) => {
          ev.preventDefault();
          lazyActions.emit(action, ev);
        });
      });

      // The embedding client owns the call audio preferences: the URL params
      // seed them and the action updates them mid-call. They are applied right
      // away, since nothing else consumes this action.
      denoiseMode.setValue(denoise ? "deepfilternet" : "off");
      autoGain.setValue(autoGainParam ?? false);
      voiceGate.setValue(voiceGateParam ?? false);
      voiceGateAuto.setValue(voiceGateAutoParam ?? true);
      if (voiceTuningParam !== undefined)
        voiceTuning.setValue(voiceTuningParam);
      if (voiceGateThresholdParam !== undefined)
        voiceGateThreshold.setValue(voiceGateThresholdParam);
      videoSimulcast.setValue(simulcast ?? false);
      if (screenShare) screenShareQuality.setValue(screenShare);
      if (screenShareAudioParam)
        screenShareAudio.setValue(screenShareAudioParam);
      mutedSounds.setValue(mutedSoundsParam ?? []);
      userVolumes.setValue(userVolumesParam ?? {});
      mutedSoundboards.setValue(mutedSoundboardsParam ?? []);
      if (soundVolume !== undefined) soundEffectVolume.setValue(soundVolume);
      if (soundboardVolumeParam !== undefined)
        soundboardVolume.setValue(soundboardVolumeParam);
      audioInput.setValue(audioInputId);
      audioOutput.setValue(audioOutputId);
      api.on(
        `action:${ElementWidgetActions.ScreenShare}`,
        (ev: CustomEvent<IWidgetApiRequest>) => {
          ev.preventDefault();
          const data = ev.detail.data as { quality: string; audio: string };
          screenShareQuality.setValue(data.quality);
          screenShareAudio.setValue(data.audio);
          screenShareStart$.next();
        },
      );
      api.on(
        `action:${ElementWidgetActions.CallSettings}`,
        (ev: CustomEvent<IWidgetApiRequest>) => {
          ev.preventDefault();
          const data = ev.detail.data as {
            denoise?: boolean;
            autoGain?: boolean;
            voiceGate?: boolean;
            voiceGateAuto?: boolean;
            voiceTuning?: unknown;
            voiceGateThreshold?: number;
            simulcast?: boolean;
            screenShare?: string;
            screenShareAudio?: string;
            soundVolume?: number;
            soundboardVolume?: number;
            mutedSounds?: string[];
            userVolumes?: Record<string, number>;
            mutedSoundboards?: string[];
            audioInput?: string;
            audioOutput?: string;
          };
          if (data.denoise !== undefined)
            denoiseMode.setValue(data.denoise ? "deepfilternet" : "off");
          if (data.autoGain !== undefined) autoGain.setValue(data.autoGain);
          if (data.voiceGate !== undefined) voiceGate.setValue(data.voiceGate);
          if (data.voiceTuning !== undefined)
            voiceTuning.setValue(normalizeVoiceTuning(data.voiceTuning));
          if (data.voiceGateAuto !== undefined)
            voiceGateAuto.setValue(data.voiceGateAuto);
          if (data.voiceGateThreshold !== undefined)
            voiceGateThreshold.setValue(data.voiceGateThreshold);
          if (data.simulcast !== undefined)
            videoSimulcast.setValue(data.simulcast);
          if (data.screenShare) screenShareQuality.setValue(data.screenShare);
          if (data.screenShareAudio)
            screenShareAudio.setValue(data.screenShareAudio);
          if (data.soundVolume !== undefined)
            soundEffectVolume.setValue(data.soundVolume);
          if (data.soundboardVolume !== undefined)
            soundboardVolume.setValue(data.soundboardVolume);
          if (data.mutedSounds !== undefined)
            mutedSounds.setValue(data.mutedSounds);
          if (data.userVolumes !== undefined)
            userVolumes.setValue(data.userVolumes);
          if (data.mutedSoundboards !== undefined)
            mutedSoundboards.setValue(data.mutedSoundboards);
          if (data.audioInput !== undefined)
            audioInput.setValue(data.audioInput || undefined);
          if (data.audioOutput !== undefined)
            audioOutput.setValue(data.audioOutput || undefined);
          api.transport.reply(ev.detail, {});
        },
      );

      // The client draws the call controls; this is how they reach the call.
      api.on(
        `action:${ElementWidgetActions.CallControl}`,
        (ev: CustomEvent<IWidgetApiRequest>) => {
          ev.preventDefault();
          applyHostCallControl(ev.detail.data);
          api.transport.reply(ev.detail, {});
        },
      );
      reportUserActivity(() => {
        api.transport
          .send(ElementWidgetActions.UserActivity, {})
          .catch(() => undefined);
      });
      // Lets the styles tell an embedded call view from a standalone one.
      document.documentElement.dataset.pinnipedEmbedded = "true";

      // Soundboard sounds go to the Publisher of the call, which owns the track.
      api.on(
        `action:${ElementWidgetActions.Soundboard}`,
        (ev: CustomEvent<IWidgetApiRequest>) => {
          ev.preventDefault();
          soundboardCommand$.next(
            ev.detail.data as unknown as SoundboardCommand,
          );
          api.transport.reply(ev.detail, {});
        },
      );

      // Now, initialize the matryoshka MatrixClient (so named because it routes
      // all requests through the host client via the widget API)
      // We need to do this now rather than later because it has capabilities to
      // request, and is responsible for starting the transport (should it be?)

      // These are all the event types the app uses
      const sendEvent = [
        EventType.CallNotify, // Sent as a deprecated fallback
        EventType.RTCNotification,
      ];
      if (sendRoomEvents) {
        sendEvent.push(EventType.RoomMessage);
      }
      const sendRecvEvent = [
        "org.matrix.rageshake_request",
        EventType.CallEncryptionKeysPrefix,
        EventType.Reaction,
        EventType.RoomRedaction,
        ElementCallReactionEventType,
        EventType.RTCDecline,
        EventType.RTCMembership,
      ];

      const sendState = [
        userId, // Legacy call membership events
        `_${userId}_${deviceId}_${rtcApplication}`, // Session membership events
        `${userId}_${deviceId}_${rtcApplication}`, // The above with no leading underscore, for room versions whose auth rules allow it
      ].map((stateKey) => ({
        eventType: EventType.GroupCallMemberPrefix,
        stateKey,
      }));
      const receiveState = [
        { eventType: EventType.RoomCreate },
        { eventType: EventType.RoomName },
        { eventType: EventType.RoomMember },
        { eventType: EventType.RoomEncryption },
        { eventType: EventType.GroupCallMemberPrefix },
      ];

      const sendRecvToDevice = [
        EventType.CallInvite,
        EventType.CallCandidates,
        EventType.CallAnswer,
        EventType.CallHangup,
        EventType.CallReject,
        EventType.CallSelectAnswer,
        EventType.CallNegotiate,
        EventType.CallSDPStreamMetadataChanged,
        EventType.CallSDPStreamMetadataChangedPrefix,
        EventType.CallReplaces,
        EventType.CallEncryptionKeysPrefix,
      ];

      const client = createRoomWidgetClient(
        api,
        {
          sendEvent: [...sendEvent, ...sendRecvEvent],
          receiveEvent: sendRecvEvent,
          sendState,
          receiveState,
          sendToDevice: sendRecvToDevice,
          receiveToDevice: sendRecvToDevice,
          turnServers: false,
          sendDelayedEvents: true,
          updateDelayedEvents: true,
          sendSticky: true,
          receiveSticky: true,
        },
        roomId,
        {
          baseUrl,
          userId,
          deviceId,
          timelineSupport: true,
          useE2eForGroupCall: e2eEnabled,
          fallbackICEServerAllowed: allowIceFallback,
        },
        // ContentLoaded event will be sent as soon as the theme is set (see useTheme.ts)
        false,
      );

      const clientPromise = async (): Promise<MatrixClient> => {
        // Wait for the config file to be ready (we load very early on so it might not
        // be otherwise)
        await Config.init();
        await client.startClient({ clientWellKnownPollPeriod: 60 * 10 });
        return client;
      };

      widget = { api, lazyActions, client: clientPromise() };
    } else {
      if (import.meta.env.MODE !== "test")
        logger.info("No widget API available");
      widget = null;
    }
  } catch (e) {
    logger.warn("Continuing without the widget API", e);
    widget = null;
  }
};

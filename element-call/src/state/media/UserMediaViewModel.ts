/*
Copyright 2023, 2024 New Vector Ltd.
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  BehaviorSubject,
  combineLatest,
  map,
  type Observable,
  of,
  startWith,
  Subject,
  switchMap,
} from "rxjs";
import {
  observeParticipantEvents,
  observeParticipantMedia,
} from "@livekit/components-core";
import { ParticipantEvent, Track } from "livekit-client";

import { type ReactionOption } from "../../reactions";
import { type Behavior } from "../Behavior";
import { type LocalUserMediaViewModel } from "./LocalUserMediaViewModel";
import {
  createMemberMedia,
  type MemberMediaInputs,
  type BaseMemberMediaViewModel,
} from "./MemberMediaViewModel";
import { type RemoteUserMediaViewModel } from "./RemoteUserMediaViewModel";
import { type ObservableScope } from "../ObservableScope";
import { showConnectionStats } from "../../settings/settings";
import { isDeafened } from "../../livekit/deafened";
import { observeRtpStreamStats$ } from "./observeRtpStreamStats";
import { observeBroadcastTracks$ } from "../../livekit/broadcastTracks";
import { observeVoiceActivity$ } from "../../livekit/voiceActivity";
import { videoFit$, videoSizeFromParticipant$ } from "../../utils/videoFit.ts";

/**
 * A participant's user media (i.e. their microphone and camera feed).
 */
export type UserMediaViewModel =
  LocalUserMediaViewModel | RemoteUserMediaViewModel;

export interface BaseUserMediaViewModel extends BaseMemberMediaViewModel {
  type: "user";
  speaking$: Behavior<boolean>;
  audioEnabled$: Behavior<boolean>;
  /** Whether the participant's client reports itself deafened. Not enforced: see DEAFENED_ATTRIBUTE. */
  deafened$: Behavior<boolean>;
  videoEnabled$: Behavior<boolean>;
  videoFit$: Behavior<"cover" | "contain">;
  toggleCropVideo: () => void;
  /**
   * The expected identity of the LiveKit participant. Exposed for debugging.
   */
  rtcBackendIdentity: string;
  handRaised$: Behavior<Date | null>;
  reaction$: Behavior<ReactionOption | null>;
  audioStreamStats$: Observable<
    RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined
  >;
  videoStreamStats$: Observable<
    RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats | undefined
  >;
  /**
   * Set the target dimensions of the HTML element (final dimension after anim).
   * This can be used to determine the best video fit (fit to frame / keep ratio).
   * @param targetWidth - The target width of the HTML element displaying the video.
   * @param targetHeight - The target height of the HTML element displaying the video.
   */
  setTargetDimensions: (targetWidth: number, targetHeight: number) => void;
}

export interface BaseUserMediaInputs extends Omit<
  MemberMediaInputs,
  "audioSource" | "videoSource"
> {
  rtcBackendIdentity: string;
  handRaised$: Behavior<Date | null>;
  reaction$: Behavior<ReactionOption | null>;
  statsType: "inbound-rtp" | "outbound-rtp";
}

export function createBaseUserMedia(
  scope: ObservableScope,
  {
    rtcBackendIdentity,
    handRaised$,
    reaction$,
    statsType,
    ...inputs
  }: BaseUserMediaInputs,
): BaseUserMediaViewModel {
  const { participant$ } = inputs;
  const media$ = scope.behavior(
    participant$.pipe(
      switchMap((p) => (p && observeParticipantMedia(p)) ?? of(undefined)),
    ),
  );
  const toggleCropVideo$ = new Subject<void>();

  // The target size of the video element, used to determine the best video fit.
  // The target size is the final size of the HTML element after any animations have completed.
  const targetSize$ = new BehaviorSubject<
    { width: number; height: number } | undefined
  >(undefined);

  return {
    ...createMemberMedia(scope, {
      ...inputs,
      audioSource: Track.Source.Microphone,
      videoSource: Track.Source.Camera,
    }),
    type: "user",
    // Speaking if the server says so or the audio itself is loud: the server's
    // updates are coarse and late, the audio is immediate (Discord-style).
    speaking$: scope.behavior(
      combineLatest([
        participant$.pipe(
          switchMap((p) =>
            p
              ? observeParticipantEvents(
                  p,
                  ParticipantEvent.IsSpeakingChanged,
                ).pipe(map((p) => p.isSpeaking))
              : of(false),
          ),
        ),
        // Everything the participant broadcasts counts: voice, soundboard, shared audio.
        observeVoiceActivity$(
          participant$.pipe(
            switchMap((p) => (p ? observeBroadcastTracks$(p) : of([]))),
          ),
        ).pipe(startWith(false)),
      ]).pipe(map(([server, voice]) => server || voice)),
    ),
    deafened$: scope.behavior(
      participant$.pipe(
        switchMap((p) =>
          p
            ? observeParticipantEvents(
                p,
                ParticipantEvent.AttributesChanged,
              ).pipe(
                startWith(p),
                map((q) => isDeafened(q.attributes)),
              )
            : of(false),
        ),
      ),
    ),
    audioEnabled$: scope.behavior(
      media$.pipe(map((m) => m?.microphoneTrack?.isMuted === false)),
    ),
    videoEnabled$: scope.behavior(
      media$.pipe(map((m) => m?.cameraTrack?.isMuted === false)),
    ),
    videoFit$: videoFit$(
      scope,
      videoSizeFromParticipant$(participant$),
      targetSize$,
    ),
    toggleCropVideo: () => toggleCropVideo$.next(),
    rtcBackendIdentity,
    handRaised$,
    reaction$,
    audioStreamStats$: combineLatest([
      participant$,
      showConnectionStats.value$,
    ]).pipe(
      switchMap(([p, showConnectionStats]) => {
        //
        if (!p || !showConnectionStats) return of(undefined);
        return observeRtpStreamStats$(p, Track.Source.Microphone, statsType);
      }),
    ),
    videoStreamStats$: combineLatest([
      participant$,
      showConnectionStats.value$,
    ]).pipe(
      switchMap(([p, showConnectionStats]) => {
        if (!p || !showConnectionStats) return of(undefined);
        return observeRtpStreamStats$(p, Track.Source.Camera, statsType);
      }),
    ),
    setTargetDimensions: (targetWidth: number, targetHeight: number): void => {
      targetSize$.next({ width: targetWidth, height: targetHeight });
    },
  };
}

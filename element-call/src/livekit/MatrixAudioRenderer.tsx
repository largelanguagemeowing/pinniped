/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { getTrackReferenceId } from "@livekit/components-core";
import { type Room as LivekitRoom } from "livekit-client";
import { type RemoteAudioTrack, Track } from "livekit-client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  useTracks,
  AudioTrack,
  type AudioTrackProps,
} from "@livekit/components-react";
import { logger } from "matrix-js-sdk/lib/logger";
import { useObservableEagerState } from "observable-hooks";

import {
  useEarpieceAudioConfig,
  useMediaDevices,
} from "../MediaDevicesContext";
import { useReactiveState } from "../useReactiveState";
import * as controls from "../controls";
import {
  mutedSoundboards,
  soundboardVolume,
  userVolumes,
  useSetting,
} from "../settings/settings";

export interface MatrixAudioRendererProps {
  /**
   * The service URL of the LiveKit room.
   */
  url: string;
  livekitRoom: LivekitRoom;
  /**
   * The list of participant identities to render audio for.
   * This list needs to be composed based on the matrixRTC members so that we do not play audio from users
   * that are not expected to be in the rtc session (local user is excluded).
   */
  validIdentities: string[];
  /** Matrix user ID of each participant, by identity, to apply per-user settings. */
  userIds?: Record<string, string>;
  /**
   * If set to `true`, mutes all audio tracks rendered by the component.
   * @remarks
   * If set to `true`, the server will stop sending audio track data to the client.
   */
  muted?: boolean;
}

const prefixedLogger = logger.getChild("[MatrixAudioRenderer]");
/**
 * Takes care of handling remote participants’ audio tracks and makes sure that microphones and screen share are audible.
 *
 * It also takes care of the earpiece audio configuration for iOS devices.
 * This is done by using the WebAudio API to create a stereo pan effect that mimics the earpiece audio.
 * @example
 * ```tsx
 * <LiveKitRoom>
 *   <MatrixAudioRenderer />
 * </LiveKitRoom>
 * ```
 * @public
 */
export function LivekitRoomAudioRenderer({
  url,
  livekitRoom,
  validIdentities,
  userIds,
  muted,
}: MatrixAudioRendererProps): ReactNode {
  const tracks = useTracks(
    [
      Track.Source.Microphone,
      Track.Source.ScreenShareAudio,
      Track.Source.Unknown,
    ],
    {
      updateOnlyOn: [],
      onlySubscribed: true,
      room: livekitRoom,
    },
  )
    // Only keep audio tracks
    .filter((ref) => ref.publication.kind === Track.Kind.Audio)
    // Only keep tracks from participants that are in the validIdentities list
    .filter((ref) => {
      const isValid = validIdentities.includes(ref.participant.identity);
      if (!isValid) {
        // TODO make sure to also skip the warn logging for the local identity
        // Log that there is an invalid identity, that means that someone is publishing audio that is not expected to be in the call.
        prefixedLogger.warn(
          `Audio track ${ref.participant.identity} from ${url} has no matching matrix call member`,
          `current members: ${validIdentities.join()}`,
          `track will not get rendered`,
        );
        return false;
      }
      return true;
    });

  // This component is also (in addition to the "only play audio for connected members" logic above)
  // responsible for mimicking earpiece audio on iPhones.
  // The Safari audio devices enumeration does not expose an earpiece audio device.
  // We alternatively use the audioContext pan node to only use one of the stereo channels.

  // Cinny (fork): every voice goes through the audio context, so that each listener's own
  // per-participant level (0-200%, set from the embedding client's context menu) can be
  // applied as a gain node of that track's own, which an audio element's volume (capped at 1)
  // cannot do. The context follows the chosen output device through setSinkId. Where the
  // browser's AudioContext has no setSinkId (Firefox, Safari) we keep the plain audio
  // elements, which honour the device, and per-participant levels past 100% are unavailable.

  const { pan: stereoPan, volume: volumeFactor } = useEarpieceAudioConfig();
  const [soundboardVolumeLevel] = useSetting(soundboardVolume);
  const [mutedSoundboardUsers] = useSetting(mutedSoundboards);
  const [userLevels] = useSetting(userVolumes);
  const levelOf = (identity: string): number =>
    userLevels[userIds?.[identity] ?? ""] ?? 1;
  const shouldUseAudioContext =
    stereoPan !== 0 || "setSinkId" in AudioContext.prototype;
  const audioOutputId = useObservableEagerState(
    useMediaDevices().audioOutput.selected$,
  )?.id;

  // initialize the potentially used audio context.
  const [audioContext, setAudioContext] = useState<AudioContext | undefined>(
    undefined,
  );
  useEffect(() => {
    const ctx = new AudioContext();
    setAudioContext(ctx);
    return (): void => {
      void ctx.close();
    };
  }, []);

  // Audio played through the context follows the chosen output device, like the elements do.
  useEffect(() => {
    if (audioContext && audioOutputId && "setSinkId" in audioContext) {
      // @ts-expect-error - setSinkId is not in the types everywhere yet.
      audioContext.setSinkId(audioOutputId).catch((ex) => {
        prefixedLogger.warn("Unable to change sink for audio context", ex);
      });
    }
  }, [audioContext, audioOutputId]);

  return (
    // We add all audio elements into one <div> for the browser developer tool experience/tidyness.
    <div style={{ display: "none" }}>
      {/* Wait for the context, so the tracks do not first play through plain elements. */}
      {(audioContext || !shouldUseAudioContext) &&
        tracks.map((trackRef) => {
          const isSoundboard = trackRef.publication.trackName === "soundboard";
          // Soundboard sounds are sent at full level; the listener sets how loud they are.
          // Silent when the listener muted that participant's soundboard.
          const soundboardLevel = mutedSoundboardUsers.includes(
            userIds?.[trackRef.participant.identity] ?? "",
          )
            ? 0
            : soundboardVolumeLevel;
          // Soundboard sounds have their own volume, so the participant's level skips them.
          const level = isSoundboard
            ? soundboardLevel
            : levelOf(trackRef.participant.identity);
          const useContext = Boolean(shouldUseAudioContext && audioContext);
          return (
            <AudioTrackWithAudioNodes
              key={getTrackReferenceId(trackRef)}
              trackRef={trackRef}
              muted={muted}
              // Silent at level 0, but the track stays subscribed (so it still shows as speaking).
              silent={level === 0}
              // Only one place applies the level, or it is applied twice. Through the audio
              // context the level is the gain node (`level`), and LiveKit would route this
              // volume into the same track's gain. Plain audio elements take it here, capped
              // at 100% (the element cannot go past it).
              volume={useContext ? undefined : Math.min(level, 1)}
              level={level}
              audioContext={useContext ? audioContext : undefined}
              stereoPan={stereoPan}
              volumeFactor={volumeFactor}
            />
          );
        })}
    </div>
  );
}

interface StereoPanAudioTrackProps {
  muted?: boolean;
  /** Silence the plain audio element, keeping the track subscribed. */
  silent?: boolean;
  /** This listener's own gain for the participant: 0 muted, 1 unchanged, up to 2. */
  level: number;
  audioContext?: AudioContext;
  /** Earpiece emulation: stereo pan and overall volume factor, applied with the level. */
  stereoPan: number;
  volumeFactor: number;
}

/**
 * This wraps `livekit.AudioTrack` to allow adding audio nodes to a track.
 * It main purpose is to remount the AudioTrack component when switching from
 * audioContext to normal audio playback.
 * As of now the AudioTrack component does not support adding audio nodes while being mounted.
 * @param props The component props
 * @param props.trackRef The track reference
 * @param props.muted If the track should be muted
 * @param props.silent Silence the plain audio element, keeping the track subscribed
 * @param props.level This listener's own gain for the participant
 * @param props.audioContext The audio context to use
 * @param props.stereoPan The earpiece stereo pan
 * @param props.volumeFactor The earpiece volume factor
 * @returns
 */
function AudioTrackWithAudioNodes({
  trackRef,
  muted,
  silent,
  level,
  audioContext,
  stereoPan,
  volumeFactor,
  ...props
}: StereoPanAudioTrackProps &
  AudioTrackProps &
  React.RefAttributes<HTMLAudioElement>): ReactNode {
  // This track's own nodes. They must not be shared between tracks: LiveKit chains a track's
  // plugin nodes after its source, so a node shared by every track would feed each track's
  // later nodes, and every voice would play once per participant, each copy at another
  // participant's level (a voice at 0 stayed audible through the others' gain).
  const nodes = useMemo(
    () =>
      audioContext && {
        gain: audioContext.createGain(),
        pan: audioContext.createStereoPanner(),
      },
    [audioContext],
  );
  // LiveKit only disconnects its own source and gain nodes, not the plugins.
  useEffect(
    () => (): void => {
      nodes?.gain.disconnect();
      nodes?.pan.disconnect();
    },
    [nodes],
  );
  // This is used to unmount/remount the AudioTrack component.
  // Mounting needs to happen after the audioContext is set.
  // (adding the audio context when already mounted did not work outside strict mode)
  const [trackReady, setTrackReady] = useReactiveState(
    () => false,
    // Reset once the audio context and its nodes are set; unsetting either resets too.
    [nodes],
  );

  useEffect(() => {
    if (nodes) nodes.pan.pan.value = stereoPan;
  }, [nodes, stereoPan]);
  useEffect(() => {
    // Through the audio context the element's own `muted` has no effect, so deafening
    // (muted) silences the track here.
    if (nodes) nodes.gain.gain.value = muted ? 0 : level * volumeFactor;
  }, [nodes, level, volumeFactor, muted]);

  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    // Plain elements only: with the audio context LiveKit keeps the element muted itself,
    // and unmuting it here would play the voice twice.
    if (audioContext || !audioRef.current) return;
    audioRef.current.muted = Boolean(silent);
  }, [audioContext, silent, trackReady]);

  useEffect(() => {
    if (!trackRef || trackReady) return;
    const track = trackRef.publication.track as RemoteAudioTrack;
    track.setAudioContext(nodes ? audioContext : undefined);
    track.setWebAudioPlugins(nodes ? [nodes.gain, nodes.pan] : []);
    setTrackReady(true);
    controls.setPlaybackStarted();
  }, [audioContext, nodes, setTrackReady, trackReady, trackRef]);

  return (
    trackReady && (
      <AudioTrack ref={audioRef} trackRef={trackRef} muted={muted} {...props} />
    )
  );
}

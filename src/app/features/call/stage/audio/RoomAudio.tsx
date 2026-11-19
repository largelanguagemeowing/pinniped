/*
Copyright 2025 New Vector Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import React, { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  getTrackReferenceId,
  type TrackReference,
  trackReferencesObservable,
} from '@livekit/components-core';
import {
  type Room as LivekitRoom,
  type RemoteAudioTrack,
  RemoteTrackPublication,
  Track,
} from 'livekit-client';
import { logger } from 'matrix-js-sdk/lib/logger';

import {
  type AudioTrackKind,
  audioTrackKind,
  type ListenerAudio,
  trackPlayback,
} from './trackPlayback';

const log = logger.getChild('[CallAudio]');

const AUDIO_SOURCES = [
  Track.Source.Microphone,
  Track.Source.ScreenShareAudio,
  Track.Source.Unknown,
];

/** The subscribed remote audio tracks of a LiveKit room. */
function useRemoteAudioTracks(room: LivekitRoom): TrackReference[] {
  const [tracks, setTracks] = useState<TrackReference[]>([]);
  useEffect(() => {
    const subscription = trackReferencesObservable(room, AUDIO_SOURCES, {
      additionalRoomEvents: [],
      onlySubscribed: true,
    }).subscribe(({ trackReferences }) =>
      setTracks(
        trackReferences.filter(
          (ref) => ref.publication.kind === Track.Kind.Audio && !ref.participant.isLocal
        )
      )
    );
    return () => subscription.unsubscribe();
  }, [room]);
  return tracks;
}

interface TrackAudioProps {
  publication: RemoteTrackPublication;
  kind: AudioTrackKind;
  /** This listener's gain for the track: 0 silent, 1 unchanged, up to 2. */
  level: number;
  /** Deafened: the server stops sending the track. */
  muted: boolean;
  /** Plays through this context when given (gain past 100%), else through the audio element. */
  audioContext: AudioContext | undefined;
}

function TrackAudio({ publication, kind, level, muted, audioContext }: TrackAudioProps): ReactNode {
  const track = publication.track as RemoteAudioTrack | undefined;
  const [element, setElement] = useState<HTMLAudioElement | null>(null);

  // This track's own nodes. They must not be shared between tracks: LiveKit chains a track's
  // plugin nodes after its source, so a node shared by every track would feed each track's
  // later nodes, and every voice would play once per participant, each copy at another
  // participant's level.
  const nodes = useMemo(
    () =>
      audioContext && {
        gain: audioContext.createGain(),
        pan: audioContext.createStereoPanner(),
      },
    [audioContext]
  );
  // LiveKit only disconnects its own source and gain nodes, not the plugins.
  useEffect(
    () => () => {
      nodes?.gain.disconnect();
      nodes?.pan.disconnect();
    },
    [nodes]
  );

  // The context and plugins go in before the element is attached: LiveKit routes the element
  // through them on attach.
  useEffect(() => {
    if (element === null || track === undefined) return undefined;
    track.setAudioContext(nodes ? audioContext : undefined);
    track.setWebAudioPlugins(nodes ? [nodes.gain, nodes.pan] : []);
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [element, track, nodes, audioContext]);

  useEffect(() => {
    // Through the audio context the element plays nothing, so the gain node does it all.
    if (nodes) nodes.gain.gain.value = muted ? 0 : level;
  }, [nodes, level, muted]);

  useEffect(() => {
    if (nodes || track === undefined || element === null) return;
    // Plain elements cannot go past 100%. Shared-screen audio keeps the volume its stream
    // control gave the track.
    if (kind !== 'screenShare') track.setVolume(Math.min(level, 1));
    // Silent at level 0, but the track stays subscribed (so it still shows as speaking).
    element.muted = level === 0 || muted;
  }, [nodes, track, element, kind, level, muted]);

  useEffect(() => {
    publication.setEnabled(!muted);
  }, [publication, track, muted]);

  // Remote voices: there is nothing to caption.
  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <audio ref={setElement} />;
}

export interface RoomAudioProps {
  /** The service URL of the LiveKit room. */
  url: string;
  livekitRoom: LivekitRoom;
  /**
   * The participant identities to play audio for: the call's MatrixRTC members, so that no one
   * outside the call is heard.
   */
  validIdentities: string[];
  /** Matrix user ID of each participant, by identity, to apply per-user settings. */
  userIds: Record<string, string>;
  listener: ListenerAudio;
  audioContext: AudioContext | undefined;
}

/** Plays the voices, soundboard sounds and shared-screen audio of one LiveKit room. */
export function RoomAudio({
  url,
  livekitRoom,
  validIdentities,
  userIds,
  listener,
  audioContext,
}: RoomAudioProps): ReactNode {
  const tracks = useRemoteAudioTracks(livekitRoom);
  const valid = useMemo(
    () =>
      tracks.filter((ref) => {
        if (validIdentities.includes(ref.participant.identity)) return true;
        log.warn(
          `Audio track ${ref.participant.identity} from ${url} has no matching matrix call member`,
          `current members: ${validIdentities.join()}`,
          'track will not get rendered'
        );
        return false;
      }),
    [tracks, validIdentities, url]
  );

  return (
    // One hidden container for all of the room's audio elements.
    <div style={{ display: 'none' }}>
      {valid.map((ref) => {
        if (!(ref.publication instanceof RemoteTrackPublication)) return null;
        const kind = audioTrackKind(ref.source, ref.publication.trackName);
        const { level, muted } = trackPlayback(kind, userIds[ref.participant.identity], listener);
        return (
          <TrackAudio
            key={getTrackReferenceId(ref)}
            publication={ref.publication}
            kind={kind}
            level={level}
            muted={muted}
            audioContext={audioContext}
          />
        );
      })}
    </div>
  );
}

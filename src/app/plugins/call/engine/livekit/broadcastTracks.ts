/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Participant,
  type Track as TrackType,
  ParticipantEvent,
  Track,
  TrackEvent,
} from 'livekit-client';
import { Observable } from 'rxjs';

/** An audio track a participant is sending, as something that can be measured. */
export interface BroadcastTrack {
  track: MediaStreamTrack;
  /**
   * The track is one this client sends (your microphone or soundboard). Whatever is on it is being broadcast, so any sound above digital
   * silence counts, whether or not the voice gate is on.
   */
  sentByUs: boolean;
}

const sameTracks = (a: BroadcastTrack[], b: BroadcastTrack[]): boolean =>
  a.length === b.length &&
  a.every((t, i) => t.track === b[i].track && t.sentByUs === b[i].sentByUs);

const TRACK_EVENTS = [
  ParticipantEvent.TrackPublished,
  ParticipantEvent.TrackUnpublished,
  ParticipantEvent.TrackSubscribed,
  ParticipantEvent.TrackUnsubscribed,
  ParticipantEvent.LocalTrackPublished,
  ParticipantEvent.LocalTrackUnpublished,
] as const;

/**
 * Every audio track a participant is currently sending: the microphone and
 * soundboard sounds, so the speaking indicator shows whenever you or a sound you
 * play is heard. Shared-screen audio is left out. Re-emits when tracks come and go and when a
 * local track gets or loses a processor (the track to measure changes with it).
 */
export function observeBroadcastTracks$(participant: Participant): Observable<BroadcastTrack[]> {
  return new Observable<BroadcastTrack[]>((subscriber) => {
    const watched = new Map<TrackType, () => void>();
    let last: BroadcastTrack[] | undefined;

    const update = (): void => {
      const current: BroadcastTrack[] = [];
      const live = new Set<TrackType>();
      participant.audioTrackPublications.forEach((publication) => {
        // Shared-screen audio is not the person talking: it must not light the indicator.
        if (publication.source === Track.Source.ScreenShareAudio) return;
        const { track } = publication;
        if (!track?.mediaStreamTrack) return;
        live.add(track);
        current.push({
          track: track.mediaStreamTrack,
          sentByUs: participant.isLocal,
        });
        // A processor swaps the track that carries the audio.
        if (participant.isLocal && !watched.has(track)) {
          track.on(TrackEvent.TrackProcessorUpdate, update);
          watched.set(track, () => track.off(TrackEvent.TrackProcessorUpdate, update));
        }
      });
      watched.forEach((stop, track) => {
        if (live.has(track)) return;
        stop();
        watched.delete(track);
      });
      if (last === undefined || !sameTracks(last, current)) {
        last = current;
        subscriber.next(current);
      }
    };

    TRACK_EVENTS.forEach((event) => participant.on(event, update));
    update();
    return (): void => {
      TRACK_EVENTS.forEach((event) => participant.off(event, update));
      watched.forEach((stop) => stop());
      watched.clear();
    };
  });
}

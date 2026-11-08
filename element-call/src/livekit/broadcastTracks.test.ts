/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventEmitter } from "events";
import { expect, test } from "vitest";
import { type Participant, ParticipantEvent, TrackEvent } from "livekit-client";

import {
  observeBroadcastTracks$,
  type BroadcastTrack,
} from "./broadcastTracks";

interface FakeTrack extends EventEmitter {
  mediaStreamTrack: MediaStreamTrack;
}

const fakeTrack = (id: string): FakeTrack =>
  Object.assign(new EventEmitter(), {
    mediaStreamTrack: { id } as MediaStreamTrack,
  }) as FakeTrack;

function fakeParticipant(isLocal: boolean): {
  participant: Participant;
  publish: (key: string, source: string, track: FakeTrack) => void;
  events: EventEmitter;
} {
  const events = new EventEmitter();
  const publications = new Map<string, { track: FakeTrack; source: string }>();
  const participant = Object.assign(events, {
    isLocal,
    audioTrackPublications: publications,
  }) as unknown as Participant;
  return {
    participant,
    events,
    publish: (key, source, track): void => {
      publications.set(key, { track, source });
      events.emit(ParticipantEvent.TrackPublished);
    },
  };
}

const collect = (participant: Participant): BroadcastTrack[][] => {
  const seen: BroadcastTrack[][] = [];
  observeBroadcastTracks$(participant).subscribe((t) => seen.push(t));
  return seen;
};

test("includes every audio track: microphone, soundboard and shared audio", () => {
  const { participant, publish } = fakeParticipant(false);
  const seen = collect(participant);
  expect(seen.at(-1)).toEqual([]);
  publish("mic", "microphone", fakeTrack("mic"));
  publish("board", "unknown", fakeTrack("board"));
  expect(seen.at(-1)?.map((t) => t.track.id)).toEqual(["mic", "board"]);
});

test("every track your client sends is sentByUs, whether or not the voice gate is on", () => {
  const { participant, publish } = fakeParticipant(true);
  const seen = collect(participant);
  publish("mic", "microphone", fakeTrack("mic"));
  publish("board", "unknown", fakeTrack("board"));
  expect(seen.at(-1)?.map((t) => t.sentByUs)).toEqual([true, true]);
});

test("a remote participant's tracks are never sentByUs", () => {
  const { participant, publish } = fakeParticipant(false);
  const seen = collect(participant);
  publish("mic", "microphone", fakeTrack("mic"));
  expect(seen.at(-1)?.[0].sentByUs).toBe(false);
});

test("measures the new track when a processor swaps the one carrying the audio", () => {
  const { participant, publish } = fakeParticipant(true);
  const seen = collect(participant);
  const mic = fakeTrack("raw");
  publish("mic", "microphone", mic);
  expect(seen.at(-1)?.[0].track.id).toBe("raw");
  mic.mediaStreamTrack = { id: "processed" } as MediaStreamTrack;
  mic.emit(TrackEvent.TrackProcessorUpdate);
  expect(seen.at(-1)?.[0].track.id).toBe("processed");
  expect(seen.at(-1)?.[0].sentByUs).toBe(true);
});

test("does not re-emit when nothing changed", () => {
  const { participant, publish, events } = fakeParticipant(false);
  const seen = collect(participant);
  publish("mic", "microphone", fakeTrack("mic"));
  const count = seen.length;
  events.emit(ParticipantEvent.TrackSubscribed);
  expect(seen).toHaveLength(count);
});

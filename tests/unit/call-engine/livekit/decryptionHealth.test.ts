/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventEmitter } from 'events';
import { type Room as LivekitRoom, RoomEvent } from 'livekit-client';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { type CallStatsStream } from '../../../../src/app/plugins/call/engine/livekit/callStats';
import {
  type DecodeSample,
  undecryptableParticipants$,
} from '../../../../src/app/plugins/call/engine/livekit/decryptionHealth';

const ADA = '@ada:example.org:ADA';
const BOB = '@bob:example.org:BOB';
const SETTLE_MS = 1000;

/** Counters as Chromium reports them; 48000 samples a second, concealed when nothing decodes. */
const audio = (
  identity: string,
  ssrc: number,
  total: number,
  concealed: number
): CallStatsStream => ({
  kind: 'audio',
  ssrc,
  identity,
  stats: { packetsReceived: total / 960, totalSamplesReceived: total, concealedSamples: concealed },
});
const video = (
  identity: string,
  ssrc: number,
  framesDecoded: number,
  packetsReceived = framesDecoded * 2 + 100
): CallStatsStream => ({
  kind: 'video',
  ssrc,
  identity,
  stats: { packetsReceived, framesDecoded },
});

const subscriptions: { unsubscribe: () => void }[] = [];
afterEach(() => subscriptions.splice(0).forEach((s) => s.unsubscribe()));

/** A LiveKit room: its events, and the remote participants in it, by identity. */
const fakeRoom = (identities: string[] = [ADA, BOB]) =>
  Object.assign(new EventEmitter(), {
    remoteParticipants: new Map(identities.map((identity) => [identity, { identity }])),
  });

function setup() {
  const room = fakeRoom();
  const rooms$ = new BehaviorSubject<LivekitRoom[]>([room as unknown as LivekitRoom]);
  const samples$ = new BehaviorSubject<DecodeSample[]>([]);
  const clock = { now: 0 };
  let current: ReadonlySet<string> = new Set();
  subscriptions.push(
    undecryptableParticipants$(rooms$, samples$, SETTLE_MS, () => clock.now).subscribe((v) => {
      current = v;
    })
  );
  /** A failure to decrypt (or, for ourselves, to encrypt), as LiveKit's room reports it. */
  const fail = (identity: string | undefined, isLocal = false, on: EventEmitter = room): void => {
    on.emit(
      RoomEvent.EncryptionError,
      new Error(`MissingKey: missing key at index 3 for participant ${identity}`),
      identity === undefined ? undefined : { identity, isLocal }
    );
  };
  const sample = (time: number, inbound: CallStatsStream[]): void => {
    samples$.next([
      ...samples$.value,
      {
        time,
        connections: [
          {
            host: 'sfu.example.org',
            rtt: 20,
            transport: { bytesSent: 0, bytesReceived: 0 },
            outbound: [],
            inbound,
          },
        ],
      },
    ]);
  };
  return { room, rooms$, clock, fail, sample, current: () => current };
}

describe('undecryptable participants', () => {
  it('lists a participant whose media failed to decrypt', () => {
    const { fail, current } = setup();
    fail(ADA);
    expect([...current()]).toEqual([ADA]);
  });

  it('ignores our own failures to encrypt, and failures of no participant', () => {
    const { fail, current } = setup();
    fail('@me:example.org:ME', true);
    fail(undefined);
    expect(current().size).toBe(0);
  });

  it('keeps them while their audio arrives but is only concealed', () => {
    const { fail, sample, clock, current } = setup();
    fail(ADA);
    for (let t = 1; t <= 4; t++) {
      clock.now = t * 1000;
      sample(t * 1000, [audio(ADA, 1, t * 48000, t * 48000)]);
    }
    expect(current().has(ADA)).toBe(true);
  });

  it('does not take audio still playing out of the jitter buffer for recovery', () => {
    const { fail, sample, clock, current } = setup();
    sample(0, [audio(ADA, 1, 480000, 0)]);
    clock.now = 500;
    fail(ADA);
    // Within a second of the failure, the frames before it still play out.
    sample(1000, [audio(ADA, 1, 528000, 45844)]);
    sample(2000, [audio(ADA, 1, 576000, 91688)]);
    expect(current().has(ADA)).toBe(true);
    sample(3000, [audio(ADA, 1, 624000, 139688)]);
    expect(current().has(ADA)).toBe(true);
  });

  it('clears them once their audio decodes, a settling interval after the failure', () => {
    const { fail, sample, clock, current } = setup();
    clock.now = 500;
    fail(ADA);
    sample(1000, [audio(ADA, 1, 48000, 48000)]);
    sample(2000, [audio(ADA, 1, 96000, 96000)]);
    sample(3000, [audio(ADA, 1, 144000, 97352)]);
    expect(current().has(ADA)).toBe(false);
  });

  it('clears them once their video decodes', () => {
    const { fail, sample, current } = setup();
    fail(ADA);
    sample(1000, [video(ADA, 2, 0)]);
    sample(2000, [video(ADA, 2, 0)]);
    expect(current().has(ADA)).toBe(true);
    sample(3000, [video(ADA, 2, 27)]);
    expect(current().has(ADA)).toBe(false);
  });

  it('keeps them while their audio decodes but their camera receives packets without decoding', () => {
    const { fail, sample, current } = setup();
    fail(ADA);
    sample(1000, [audio(ADA, 1, 48000, 48000), video(ADA, 2, 0)]);
    sample(2000, [audio(ADA, 1, 96000, 48000), video(ADA, 2, 0, 300)]);
    sample(3000, [audio(ADA, 1, 144000, 48000), video(ADA, 2, 0, 600)]);
    expect(current().has(ADA)).toBe(true);
    sample(4000, [audio(ADA, 1, 192000, 48000), video(ADA, 2, 30, 900)]);
    expect(current().has(ADA)).toBe(false);
  });

  it('clears them when their audio decodes and their camera has stopped sending', () => {
    const { fail, sample, current } = setup();
    fail(ADA);
    sample(1000, [audio(ADA, 1, 48000, 48000), video(ADA, 2, 0, 100)]);
    sample(2000, [audio(ADA, 1, 96000, 96000), video(ADA, 2, 0, 100)]);
    sample(3000, [audio(ADA, 1, 144000, 100000), video(ADA, 2, 0, 100)]);
    expect(current().has(ADA)).toBe(false);
  });

  it("does not clear them when someone else's media decodes", () => {
    const { fail, sample, current } = setup();
    fail(ADA);
    sample(1000, [audio(ADA, 1, 48000, 48000), audio(BOB, 2, 48000, 0)]);
    sample(2000, [audio(ADA, 1, 96000, 96000), audio(BOB, 2, 96000, 0)]);
    sample(3000, [audio(ADA, 1, 144000, 144000), audio(BOB, 2, 144000, 0)]);
    expect([...current()]).toEqual([ADA]);
  });

  it('does not count a stream that has just appeared', () => {
    const { fail, sample, current } = setup();
    fail(ADA);
    sample(1000, []);
    sample(2000, []);
    // Its counters could predate the failure.
    sample(3000, [audio(ADA, 1, 480000, 0)]);
    expect(current().has(ADA)).toBe(true);
  });

  it('lists them again on a new failure', () => {
    const { fail, sample, clock, current } = setup();
    fail(ADA);
    sample(1000, [video(ADA, 2, 0)]);
    sample(2000, [video(ADA, 2, 30)]);
    expect(current().has(ADA)).toBe(false);
    clock.now = 2500;
    fail(ADA);
    expect(current().has(ADA)).toBe(true);
  });

  it("drops them once they are in none of the call's rooms", () => {
    const { room, fail, sample, current } = setup();
    fail(ADA);
    sample(1000, [audio(ADA, 1, 48000, 48000)]);
    sample(2000, [audio(ADA, 1, 96000, 96000)]);
    expect(current().has(ADA)).toBe(true);
    room.remoteParticipants.delete(ADA);
    sample(3000, []);
    expect(current().has(ADA)).toBe(false);
  });

  it("follows the call's rooms", () => {
    const { room, rooms$, fail, current } = setup();
    const next = fakeRoom();
    rooms$.next([next as unknown as LivekitRoom]);
    expect(room.listenerCount(RoomEvent.EncryptionError)).toBe(0);
    fail(ADA, false, room);
    expect(current().size).toBe(0);
    fail(BOB, false, next);
    expect([...current()]).toEqual([BOB]);
  });
});

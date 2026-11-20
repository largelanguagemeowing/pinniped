/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Participant, type Room as LivekitRoom, RoomEvent } from 'livekit-client';
import {
  distinctUntilChanged,
  map,
  merge,
  Observable,
  scan,
  switchMap,
  withLatestFrom,
} from 'rxjs';

import { type CallStatsConnection, type CallStatsStream } from './callStats';

/** A stats sample: its connections' counters, requested at `time`. */
export interface DecodeSample {
  time: number;
  connections: CallStatsConnection[];
}

/** Remote participants whose media failed to decrypt, by LiveKit identity: when it last did. */
type Failures = ReadonlyMap<string, number>;

type Change =
  | { kind: 'failure'; identity: string; time: number }
  | {
      kind: 'samples';
      samples: readonly DecodeSample[];
      /** Whether the participant is still in one of the call's rooms. */
      present: (identity: string) => boolean;
    };

/** Video frames, or audio samples that were not concealment, a stream has decoded so far. */
const decoded = (stream: CallStatsStream): number => {
  const count = (key: string): number => {
    const value = stream.stats[key];
    return typeof value === 'number' ? value : 0;
  };
  return stream.kind === 'video'
    ? count('framesDecoded')
    : count('totalSamplesReceived') - count('concealedSamples');
};

/**
 * The participants who decoded media between two samples. A frame only reaches the decoder once
 * it is decrypted, so this is proof that decrypting their media works.
 */
export function decodedBetween(prev: DecodeSample, cur: DecodeSample): Set<string> {
  const key = (stream: CallStatsStream): string => `${stream.identity} ${stream.ssrc}`;
  const before = new Map(
    prev.connections.flatMap((c) => c.inbound).map((stream) => [key(stream), decoded(stream)])
  );
  const identities = new Set<string>();
  cur.connections
    .flatMap((c) => c.inbound)
    .forEach((stream) => {
      const previous = before.get(key(stream));
      if (stream.identity !== undefined && previous !== undefined && decoded(stream) > previous)
        identities.add(stream.identity);
    });
  return identities;
}

/** A room's decryption failures of remote participants' media. */
const roomFailures$ = (room: LivekitRoom, now: () => number): Observable<Change> =>
  new Observable<Change>((subscriber) => {
    // Our own identity reports failures to encrypt; others' failures to decrypt.
    const onError = (_error: Error, participant?: Participant): void => {
      if (participant !== undefined && !participant.isLocal)
        subscriber.next({ kind: 'failure', identity: participant.identity, time: now() });
    };
    room.on(RoomEvent.EncryptionError, onError);
    return () => {
      room.off(RoomEvent.EncryptionError, onError);
    };
  });

/**
 * The remote participants, by LiveKit identity, whose media we cannot decrypt: LiveKit reported a
 * failure to decrypt it, their media has not decoded since, and they are still in the call.
 *
 * LiveKit reports no recovery; it drops frames silently once it gives up on a key, until a
 * working key arrives. So recovery is read from the stats instead: media that decoded in a
 * sampling interval that started at least `settleMs` after the failure. Audio already in the
 * jitter buffer still plays out after frames stop decrypting (tens of milliseconds in
 * Chromium), and must not count.
 */
export function undecryptableParticipants$(
  rooms$: Observable<readonly LivekitRoom[]>,
  samples$: Observable<readonly DecodeSample[]>,
  settleMs: number,
  now: () => number = Date.now
): Observable<ReadonlySet<string>> {
  const failures$ = rooms$.pipe(
    switchMap((rooms) => merge(...rooms.map((room) => roomFailures$(room, now))))
  );
  const sampled$ = samples$.pipe(
    withLatestFrom(rooms$),
    map(([samples, rooms]): Change => ({
      kind: 'samples',
      samples,
      present: (identity) => rooms.some((room) => room.remoteParticipants.has(identity)),
    }))
  );

  return merge(failures$, sampled$).pipe(
    scan((failures: Failures, change: Change): Failures => {
      if (change.kind === 'failure') return new Map(failures).set(change.identity, change.time);
      const [prev, cur] = change.samples.slice(-2);
      if (cur === undefined || failures.size === 0) return failures;
      const recovered = decodedBetween(prev, cur);
      const next = new Map(failures);
      failures.forEach((time, identity) => {
        const decodes = recovered.has(identity) && prev.time - time >= settleMs;
        if (decodes || !change.present(identity)) next.delete(identity);
      });
      return next.size === failures.size ? failures : next;
    }, new Map()),
    distinctUntilChanged(),
    map((failures) => new Set(failures.keys()))
  );
}

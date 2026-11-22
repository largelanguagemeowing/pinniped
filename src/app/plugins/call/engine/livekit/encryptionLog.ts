/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  CryptorErrorReason,
  KeyProviderEvent,
  type KeyInfo,
  type Participant,
  type Room as LivekitRoom,
  RoomEvent,
} from 'livekit-client';
import { merge, Observable, switchMap } from 'rxjs';

/**
 * Something the call's media encryption did, for the call report: when keys arrive and when
 * media fails to decrypt. The worker drops undecryptable frames without a trace, so the failures
 * (LiveKit reports each at most once a second) mark the start of a gap and the next key marks
 * its likely end.
 */
export type EncryptionEvent = {
  /** When it happened (ms since the epoch). */
  time: number;
  /** LiveKit identity of the participant it concerns; absent for errors not tied to one. */
  identity?: string;
  /** Matrix user ID of that participant, when the call knows it. */
  participant?: string;
  /** Whether it concerns our own media. */
  local: boolean;
} & ({ kind: 'key'; keyIndex?: number } | { kind: 'failure'; reason: string; message: string });

const REASONS = Object.values(CryptorErrorReason).filter(
  (name): name is string => typeof name === 'string'
);

/**
 * The reason and message of an error the E2EE worker reported. Structured cloning across the
 * worker boundary leaves a plain `Error`, so the reason travels as the message's prefix
 * (`MissingKey: missing key at index 3 ...`); errors from elsewhere have none.
 */
const parseError = (error: Error): { reason: string; message: string } => {
  const reason = REASONS.find((name) => error.message.startsWith(`${name}: `));
  return reason === undefined
    ? { reason: 'Error', message: error.message }
    : { reason, message: error.message.slice(reason.length + 2) };
};

/** Keys set on a room's key provider, and the room's encryption errors. */
const roomEvents$ = (room: LivekitRoom, now: () => number): Observable<EncryptionEvent> =>
  new Observable<EncryptionEvent>((subscriber) => {
    const local = (identity?: string): boolean => identity === room.localParticipant?.identity;

    const onError = (error: Error, participant?: Participant): void =>
      subscriber.next({
        kind: 'failure',
        time: now(),
        identity: participant?.identity,
        local: participant?.isLocal ?? false,
        ...parseError(error),
      });
    room.on(RoomEvent.EncryptionError, onError);

    const e2ee = room.options.e2ee;
    const provider = e2ee !== undefined && 'keyProvider' in e2ee ? e2ee.keyProvider : undefined;
    const onKey = ({ participantIdentity, keyIndex }: KeyInfo): void =>
      subscriber.next({
        kind: 'key',
        time: now(),
        identity: participantIdentity,
        local: local(participantIdentity),
        keyIndex,
      });
    provider?.on(KeyProviderEvent.SetKey, onKey);

    return () => {
      room.off(RoomEvent.EncryptionError, onError);
      provider?.off(KeyProviderEvent.SetKey, onKey);
    };
  });

/** The encryption events of every given room, as they happen. */
export const encryptionEvents$ = (
  rooms$: Observable<readonly LivekitRoom[]>,
  now: () => number = Date.now
): Observable<EncryptionEvent> =>
  rooms$.pipe(switchMap((rooms) => merge(...rooms.map((room) => roomEvents$(room, now)))));

/** The events to keep: those since `since`, and at most `limit` of the latest. */
export const retainEncryptionEvents = (
  events: readonly EncryptionEvent[],
  since: number,
  limit: number
): EncryptionEvent[] => events.filter((e) => e.time > since).slice(-limit);

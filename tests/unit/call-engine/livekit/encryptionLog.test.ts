/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { EventEmitter } from 'events';
import { KeyProviderEvent, type Room as LivekitRoom, RoomEvent } from 'livekit-client';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import {
  type EncryptionEvent,
  encryptionEvents$,
  retainEncryptionEvents,
} from '../../../../src/app/plugins/call/engine/livekit/encryptionLog';

const ME = '@me:example.org:ME';
const ADA = '@ada:example.org:ADA';

const subscriptions: { unsubscribe: () => void }[] = [];
afterEach(() => subscriptions.splice(0).forEach((s) => s.unsubscribe()));

/** A LiveKit room with its E2EE key provider, which are plain emitters here. */
const fakeRoom = () => {
  const keyProvider = new EventEmitter();
  const room = Object.assign(new EventEmitter(), {
    localParticipant: { identity: ME },
    options: { e2ee: { keyProvider } },
  });
  return { room, keyProvider };
};

function setup() {
  const first = fakeRoom();
  const rooms$ = new BehaviorSubject<LivekitRoom[]>([first.room as unknown as LivekitRoom]);
  const clock = { now: 100 };
  const events: EncryptionEvent[] = [];
  subscriptions.push(encryptionEvents$(rooms$, () => clock.now).subscribe((e) => events.push(e)));
  return { ...first, rooms$, clock, events };
}

describe('encryptionEvents$', () => {
  it('reports the keys set on the key provider, ours marked as local', () => {
    const { keyProvider, events, clock } = setup();
    keyProvider.emit(KeyProviderEvent.SetKey, { participantIdentity: ADA, keyIndex: 12 }, true);
    clock.now = 200;
    keyProvider.emit(KeyProviderEvent.SetKey, { participantIdentity: ME, keyIndex: 0 }, true);
    expect(events).toEqual([
      { kind: 'key', time: 100, identity: ADA, local: false, keyIndex: 12 },
      { kind: 'key', time: 200, identity: ME, local: true, keyIndex: 0 },
    ]);
  });

  it('reports decryption failures with their reason and participant', () => {
    const { room, events } = setup();
    // As the worker sends it: structured cloning leaves a plain Error with the reason as prefix.
    const error = new Error('MissingKey: missing key at index 11');
    room.emit(RoomEvent.EncryptionError, error, { identity: ADA, isLocal: false });
    room.emit(RoomEvent.EncryptionError, new Error('no participant'), undefined);
    expect(events).toEqual([
      {
        kind: 'failure',
        time: 100,
        identity: ADA,
        local: false,
        reason: 'MissingKey',
        message: 'missing key at index 11',
      },
      {
        kind: 'failure',
        time: 100,
        identity: undefined,
        local: false,
        reason: 'Error',
        message: 'no participant',
      },
    ]);
  });

  it('follows the rooms of the call, and stops listening to one that is gone', () => {
    const { rooms$, keyProvider, events } = setup();
    const next = fakeRoom();
    rooms$.next([next.room as unknown as LivekitRoom]);
    keyProvider.emit(KeyProviderEvent.SetKey, { participantIdentity: ADA, keyIndex: 1 }, true);
    next.keyProvider.emit(KeyProviderEvent.SetKey, { participantIdentity: ADA, keyIndex: 2 }, true);
    expect(events.map((e) => e.kind === 'key' && e.keyIndex)).toEqual([2]);
  });

  it('works for a room without encryption', () => {
    const room = Object.assign(new EventEmitter(), {
      localParticipant: { identity: ME },
      options: {},
    });
    const events: EncryptionEvent[] = [];
    subscriptions.push(
      encryptionEvents$(new BehaviorSubject([room as unknown as LivekitRoom])).subscribe((e) =>
        events.push(e)
      )
    );
    room.emit(RoomEvent.EncryptionError, new Error('x'), undefined);
    expect(events).toHaveLength(1);
  });
});

describe('retainEncryptionEvents', () => {
  const at = (time: number): EncryptionEvent => ({ kind: 'key', time, local: false });

  it('drops events older than the window, then the oldest beyond the limit', () => {
    const events = [at(1), at(5), at(6), at(7)];
    expect(retainEncryptionEvents(events, 1, 10).map((e) => e.time)).toEqual([5, 6, 7]);
    expect(retainEncryptionEvents(events, 1, 2).map((e) => e.time)).toEqual([6, 7]);
  });
});

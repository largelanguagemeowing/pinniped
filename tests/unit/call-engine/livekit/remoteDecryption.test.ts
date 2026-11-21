/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConnectionState,
  Encryption_Type,
  ExternalE2EEKeyProvider,
  Room,
  RoomEvent,
} from 'livekit-client';

interface WorkerMessage {
  kind: string;
  data: { participantIdentity?: string; enabled?: boolean };
}

/** Records what LiveKit's E2EE manager tells its worker. */
class RecordingWorker {
  readonly messages: WorkerMessage[] = [];

  onmessage: unknown = null;

  onerror: unknown = null;

  postMessage(message: WorkerMessage): void {
    this.messages.push(message);
  }

  terminate(): void {}
}

const BOB = '@bob:example.org:BOB';
const bob = { identity: BOB } as never;

/** A publication as the media server describes it; it claims the track is not encrypted. */
const unencrypted = { trackInfo: { encryption: Encryption_Type.NONE, mimeType: 'audio/opus' } };

const encryptedRoom = (): { room: Room; worker: RecordingWorker } => {
  const worker = new RecordingWorker();
  const room = new Room({
    e2ee: { keyProvider: new ExternalE2EEKeyProvider(), worker: worker as unknown as Worker },
  });
  return { room, worker };
};

const enables = (worker: RecordingWorker, identity: string): (boolean | undefined)[] =>
  worker.messages
    .filter((m) => m.kind === 'enable' && m.data.participantIdentity === identity)
    .map((m) => m.data.enabled);

beforeEach(() => {
  // Insertable streams, as in Chromium: the receiver's frames reach the worker by message.
  vi.stubGlobal(
    'RTCRtpSender',
    class {
      createEncodedStreams(): void {}
    }
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a remote participant's media in an encrypted call", () => {
  it('stays decrypted when the server says a new track is not encrypted', () => {
    const { room, worker } = encryptedRoom();

    room.emit(RoomEvent.TrackPublished, unencrypted as never, bob);

    expect(enables(worker, BOB)).toEqual([true]);
  });

  it("stays decrypted when the server's participant list says so on (re)connect", () => {
    const { room, worker } = encryptedRoom();
    room.remoteParticipants.set(BOB, {
      identity: BOB,
      trackPublications: new Map([['TR_audio', unencrypted]]),
    } as never);

    room.emit(RoomEvent.ConnectionStateChanged, ConnectionState.Connected);

    expect(enables(worker, BOB)).toEqual([true]);
  });

  it('is decrypted from the first frame of a subscribed track', () => {
    const { room, worker } = encryptedRoom();
    const track = {
      kind: 'audio',
      mediaStreamID: 'bob-microphone',
      receiver: { createEncodedStreams: () => ({ readable: {}, writable: {} }) },
    };

    room.emit(RoomEvent.TrackSubscribed, track as never, unencrypted as never, bob);

    const forBob = worker.messages.filter((m) => m.data.participantIdentity === BOB);
    expect(forBob.map((m) => [m.kind, m.data.enabled])).toEqual([
      ['enable', true],
      ['decode', undefined],
    ]);
  });
});

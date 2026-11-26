/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Encryption_Type, type Room as LivekitRoom, Track } from 'livekit-client';
import { describe, expect, it } from 'vitest';

import { sampleConnection } from '../../../../src/app/plugins/call/engine/livekit/callStats';

/** A LiveKit room on one peer connection whose publisher reports `stats`. */
const fakeRoom = (stats: Record<string, unknown>[]) =>
  ({
    engine: {
      pcManager: {
        publisher: { getStats: async () => new Map(stats.map((s) => [s.id, s])) },
        subscriber: undefined,
      },
      client: { rtt: 20 },
    },
    localParticipant: { trackPublications: new Map() },
    remoteParticipants: new Map(),
  }) as unknown as LivekitRoom;

/** Our camera's `outbound-rtp` entry, as Chromium reports it. */
const camera = (fields: Record<string, unknown>) => ({
  id: 'OT01V1',
  type: 'outbound-rtp',
  kind: 'video',
  ssrc: 1,
  bytesSent: 1000,
  qualityLimitationReason: 'cpu',
  qualityLimitationResolutionChanges: 2,
  ...fields,
});

const sampleCamera = async (fields: Record<string, unknown>) => {
  const connection = await sampleConnection('wss://sfu.example.org', fakeRoom([camera(fields)]));
  return connection?.outbound[0];
};

describe('call stats sampling', () => {
  it("keeps how long an outbound stream's encoder was limited by each reason", async () => {
    const durations = { none: 10, cpu: 2.5, bandwidth: 1, other: 0 };
    const stream = await sampleCamera({ qualityLimitationDurations: durations });
    expect(stream?.qualityLimitationDurations).toEqual(durations);
    expect(stream?.stats.qualityLimitationReason).toBe('cpu');
    expect(stream?.stats.qualityLimitationResolutionChanges).toBe(2);
  });

  it.each([
    ['is not reported', undefined],
    ['is null', null],
    ['is not a record', 12],
    ['lacks a reason', { none: 10, cpu: 2.5, bandwidth: 1 }],
    ['has a reason that is not a number', { none: 10, cpu: '2.5', bandwidth: 1, other: 0 }],
  ])('has no durations when the record %s', async (_, qualityLimitationDurations) => {
    const stream = await sampleCamera({ qualityLimitationDurations });
    expect(stream?.qualityLimitationDurations).toBeUndefined();
    expect(stream?.stats.bytesSent).toBe(1000);
  });
});

describe("this machine's audio devices", () => {
  it('reports how often WebRTC playout ran dry', async () => {
    const connection = await sampleConnection(
      'wss://sfu.example.org',
      fakeRoom([
        {
          id: 'AP',
          type: 'media-playout',
          kind: 'audio',
          synthesizedSamplesEvents: 3,
          synthesizedSamplesDuration: 0.03,
          totalSamplesDuration: 42,
        },
      ])
    );
    expect(connection?.playout).toEqual({
      underrunEvents: 3,
      underrunSeconds: 0.03,
      playedSeconds: 42,
    });
  });

  it('has no playout or microphone where the browser reports none', async () => {
    const connection = await sampleConnection('wss://sfu.example.org', fakeRoom([]));
    expect(connection?.playout).toBeUndefined();
    expect(connection?.microphone).toBeUndefined();
  });

  /** A room that publishes a microphone whose captured track has `stats`. */
  const micRoom = (stats: unknown, processor?: unknown): LivekitRoom => {
    const captured = { stats };
    const room = fakeRoom([]) as unknown as {
      localParticipant: { trackPublications: Map<string, unknown> };
    };
    room.localParticipant.trackPublications.set('TR_mic', {
      source: Track.Source.Microphone,
      track: {
        // With a processor LiveKit hands out its output, which has no device behind it.
        mediaStreamTrack: processor ? { stats: undefined } : captured,
        _mediaStreamTrack: captured,
        getProcessor: () => processor,
      },
    });
    return room as unknown as LivekitRoom;
  };

  it('reports the microphone audio the capture device dropped', async () => {
    const stats = { totalFramesDuration: 60_000, deliveredFramesDuration: 59_700 };
    const connection = await sampleConnection('wss://sfu.example.org', micRoom(stats));
    expect(connection?.microphone).toEqual({
      droppedSeconds: 0.3,
      capturedSeconds: 60,
      processed: false,
    });
  });

  it('reads the captured track of a processed microphone, and says it is processed', async () => {
    const stats = { totalFramesDuration: 10_000, deliveredFramesDuration: 10_000 };
    const connection = await sampleConnection('wss://sfu.example.org', micRoom(stats, {}));
    expect(connection?.microphone).toEqual({
      droppedSeconds: 0,
      capturedSeconds: 10,
      processed: true,
    });
  });

  it('has no microphone where the track has no stats', async () => {
    const connection = await sampleConnection('wss://sfu.example.org', micRoom(undefined));
    expect(connection?.microphone).toBeUndefined();
  });
});

describe('announced encryption of inbound tracks', () => {
  /** A remote camera of `ada` whose publication the server announces with `encryption`. */
  const inboundCamera = async (encryption: number) => {
    const room = fakeRoom([
      { id: 'IT01V1', type: 'inbound-rtp', kind: 'video', ssrc: 7, trackIdentifier: 'trk' },
    ]) as unknown as { remoteParticipants: Map<string, unknown> };
    room.remoteParticipants.set('ada', {
      identity: 'ada',
      trackPublications: new Map([
        [
          'TR1',
          {
            source: Track.Source.Camera,
            trackInfo: { encryption },
            track: { receiver: { track: { id: 'trk' } } },
          },
        ],
      ]),
    });
    const connection = await sampleConnection(
      'wss://sfu.example.org',
      room as unknown as LivekitRoom
    );
    return connection?.inbound[0];
  };

  it('is reported for a track the server says is not encrypted', async () => {
    expect((await inboundCamera(Encryption_Type.NONE))?.announcedEncryption).toBe('none');
  });

  it('is reported for a track the server says is encrypted', async () => {
    expect((await inboundCamera(Encryption_Type.GCM))?.announcedEncryption).toBe('encrypted');
  });
});

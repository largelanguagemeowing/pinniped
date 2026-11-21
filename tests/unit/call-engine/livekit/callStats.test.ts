/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Room as LivekitRoom } from 'livekit-client';
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

/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Room as LivekitRoom } from "livekit-client";

/**
 * Raw WebRTC counters of one SFU connection, sampled once a second and sent to
 * the embedding client (see ElementWidgetActions.CallStats), which turns the
 * counters into rates and graphs. Counters are cumulative; the client diffs them.
 */
export type StatValue = number | string | boolean;

/**
 * One RTP stream's `outbound-rtp` / `inbound-rtp` entry as the browser reports
 * it (counters are cumulative), plus its codec's MIME type and, for outbound
 * streams, the SFU's `remote-inbound-rtp` report. The client picks the fields.
 */
export interface CallStatsStream {
  kind: string;
  ssrc: number;
  codec?: string;
  stats: Record<string, StatValue>;
  remote?: Record<string, StatValue>;
  /** The capture source feeding an outbound stream (its input frame rate, resolution). */
  source?: Record<string, StatValue>;
}

export interface CallStatsConnection {
  /** Hostname of the SFU. */
  host: string;
  /** Signalling round-trip time in ms, falling back to the ICE pair's RTT. */
  rtt: number | null;
  transport: {
    /** Bits per second, as estimated by the browser's congestion control. */
    availableOutgoingBitrate?: number;
    bytesSent: number;
    bytesReceived: number;
    /** "udp" | "tcp" of the selected candidate pair, when known. */
    protocol?: string;
  };
  outbound: CallStatsStream[];
  inbound: CallStatsStream[];
}

export interface CallStatsSample {
  /** Epoch ms. */
  time: number;
  connections: CallStatsConnection[];
}

type Stat = Record<string, unknown>;

const num = (v: unknown): number | undefined =>
  typeof v === "number" ? v : undefined;

function entries(report: RTCStatsReport | undefined): Stat[] {
  const out: Stat[] = [];
  report?.forEach((s: Stat) => out.push(s));
  return out;
}

/** Samples one livekit room, or null while it has no peer connection. */
export async function sampleConnection(
  url: string,
  room: LivekitRoom,
): Promise<CallStatsConnection | null> {
  const pcManager = room.engine.pcManager;
  if (!pcManager) return null;
  const [pub, sub] = await Promise.all([
    pcManager.publisher.getStats().catch(() => undefined),
    pcManager.subscriber?.getStats().catch(() => undefined),
  ]);
  const pubStats = entries(pub);
  const subStats = entries(sub);

  // The pair carrying media: the transport's selected pair when exposed,
  // otherwise the nominated succeeded one. Prefer the publisher's.
  const pairOf = (stats: Stat[]): Stat | undefined => {
    const byId = new Map(stats.map((s) => [s.id as string, s]));
    const transport = stats.find((s) => s.type === "transport");
    const selected = transport?.selectedCandidatePairId as string | undefined;
    return (
      (selected ? byId.get(selected) : undefined) ??
      stats.find(
        (s) =>
          s.type === "candidate-pair" && s.nominated && s.state === "succeeded",
      )
    );
  };
  const pubPair = pairOf(pubStats);
  const pair = pubPair ?? pairOf(subStats);
  const pairRtt = num(pair?.currentRoundTripTime);
  // The local candidate lives in the same connection's stats as its pair.
  const local = pair
    ? (pubPair ? pubStats : subStats).find(
        (s) => s.id === pair.localCandidateId,
      )
    : undefined;

  const byId = new Map(
    [...pubStats, ...subStats].map((s) => [s.id as string, s]),
  );
  const remoteInbound = new Map(
    pubStats
      .filter((s) => s.type === "remote-inbound-rtp")
      .map((s) => [s.ssrc as number, s]),
  );
  const plain = (s: Stat | undefined): Record<string, StatValue> | undefined =>
    s &&
    (Object.fromEntries(
      Object.entries(s).filter(
        ([k, v]) =>
          k !== "id" &&
          k !== "type" &&
          (typeof v === "number" ||
            typeof v === "string" ||
            typeof v === "boolean"),
      ),
    ) as Record<string, StatValue>);
  const stream = (s: Stat): CallStatsStream => ({
    kind: String(s.kind),
    ssrc: s.ssrc as number,
    codec: byId.get(s.codecId as string)?.mimeType as string | undefined,
    stats: plain(s)!,
    remote: plain(remoteInbound.get(s.ssrc as number)),
    source: plain(byId.get(s.mediaSourceId as string)),
  });
  const outbound = pubStats
    .filter((s) => s.type === "outbound-rtp")
    .map(stream);
  // With a single peer connection (livekit's default) incoming media arrives
  // on the publisher's connection; otherwise on the subscriber's.
  const inbound = [...pubStats, ...subStats]
    .filter((s) => s.type === "inbound-rtp")
    .map(stream);

  const signalRtt = room.engine.client.rtt;
  return {
    host: new URL(url).hostname,
    rtt:
      signalRtt > 0
        ? signalRtt
        : pairRtt !== undefined
          ? Math.round(pairRtt * 1000)
          : null,
    transport: {
      availableOutgoingBitrate: num(pair?.availableOutgoingBitrate),
      bytesSent: num(pair?.bytesSent) ?? 0,
      bytesReceived: num(pair?.bytesReceived) ?? 0,
      protocol:
        typeof local?.protocol === "string" ? local.protocol : undefined,
    },
    outbound,
    inbound,
  };
}

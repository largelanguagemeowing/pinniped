/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Room as LivekitRoom,
  Track,
  type TrackPublication,
} from "livekit-client";

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
  /**
   * The negotiated SDP fmtp line of the codec (e.g. Opus "stereo=1"). Stereo
   * is signalled here, not by the channel count, which Opus always reports as 2.
   */
  sdpFmtpLine?: string;
  stats: Record<string, StatValue>;
  remote?: Record<string, StatValue>;
  /** The capture source feeding an outbound stream (its input frame rate, resolution). */
  source?: Record<string, StatValue>;
  /**
   * Matrix user ID of the participant an inbound stream comes from. Absent for
   * outbound streams, which are always ours.
   */
  participant?: string;
  /** What the track carries: "Microphone", "Camera", "Screen share", "Soundboard"... */
  track?: string;
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

type Stat = Record<string, unknown>;

interface StreamLabel {
  participant?: string;
  track: string;
}

const trackLabel = (pub: TrackPublication): string => {
  if (pub.trackName === "soundboard") return "Soundboard";
  switch (pub.source) {
    case Track.Source.Microphone:
      return "Microphone";
    case Track.Source.Camera:
      return "Camera";
    case Track.Source.ScreenShare:
      return "Screen share";
    case Track.Source.ScreenShareAudio:
      return "Screen share audio";
    default:
      return pub.trackName || "Track";
  }
};

/**
 * Names the tracks of this connection by the ID of the MediaStreamTrack on the
 * wire, which the stats report as `trackIdentifier` (on `inbound-rtp`, and on
 * the `media-source` of an `outbound-rtp`). Ours are keyed by the sender's
 * track, which differs from the captured one when a processor is applied.
 */
function labelTracks(
  room: LivekitRoom,
  userIds: Record<string, string>,
): Map<string, StreamLabel> {
  const labels = new Map<string, StreamLabel>();

  room.localParticipant.trackPublications.forEach((pub) => {
    const id = pub.track?.sender?.track?.id;
    if (id) labels.set(id, { track: trackLabel(pub) });
  });

  room.remoteParticipants.forEach((participant) => {
    const from = userIds[participant.identity] ?? participant.identity;
    participant.trackPublications.forEach((pub) => {
      const id = pub.track?.receiver?.track.id;
      if (id) labels.set(id, { participant: from, track: trackLabel(pub) });
    });
  });

  return labels;
}

const num = (v: unknown): number | undefined =>
  typeof v === "number" ? v : undefined;

function entries(report: RTCStatsReport | undefined): Stat[] {
  const out: Stat[] = [];
  report?.forEach((s: Stat) => out.push(s));
  return out;
}

/**
 * Samples one livekit room, or null while it has no peer connection.
 * `userIds` maps each remote LiveKit identity to its Matrix user ID.
 */
export async function sampleConnection(
  url: string,
  room: LivekitRoom,
  userIds: Record<string, string> = {},
): Promise<CallStatsConnection | null> {
  const pcManager = room.engine.pcManager;
  if (!pcManager) return null;
  const [pub, sub] = await Promise.all([
    pcManager.publisher.getStats().catch(() => undefined),
    pcManager.subscriber?.getStats().catch(() => undefined),
  ]);
  const labels = labelTracks(room, userIds);
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
  const stream = (s: Stat): CallStatsStream => {
    const codec = byId.get(s.codecId as string);
    const source = byId.get(s.mediaSourceId as string);
    const label = labels.get(
      (s.trackIdentifier ?? source?.trackIdentifier) as string,
    );
    return {
      kind: String(s.kind),
      ssrc: s.ssrc as number,
      codec: codec?.mimeType as string | undefined,
      sdpFmtpLine: codec?.sdpFmtpLine as string | undefined,
      stats: plain(s)!,
      remote: plain(remoteInbound.get(s.ssrc as number)),
      source: plain(source),
      participant: label?.participant,
      track: label?.track,
    };
  };
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

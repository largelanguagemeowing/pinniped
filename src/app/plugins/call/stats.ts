/** Raw WebRTC counters reported by the call widget once a second (see the widget's callStats.ts). */
export type StatValue = number | string | boolean;

export type CallStatsStream = {
  kind: string;
  ssrc: number;
  codec?: string;
  /** Negotiated SDP fmtp line of the codec; Opus "stereo=1" means stereo. */
  sdpFmtpLine?: string;
  stats: Record<string, StatValue>;
  remote?: Record<string, StatValue>;
  source?: Record<string, StatValue>;
  /** Matrix user ID the inbound stream comes from; absent for outbound (ours). */
  participant?: string;
  /** What the track carries, as the widget names it, e.g. "Microphone". */
  track?: string;
};

export type CallStatsConnection = {
  host: string;
  rtt: number | null;
  transport: {
    availableOutgoingBitrate?: number;
    bytesSent: number;
    bytesReceived: number;
    protocol?: string;
  };
  outbound: CallStatsStream[];
  inbound: CallStatsStream[];
};

export type CallStatsSample = {
  time: number;
  connections: CallStatsConnection[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const optional = <T>(value: unknown, is: (v: unknown) => v is T): T | undefined =>
  is(value) ? value : undefined;

const isString = (value: unknown): value is string => typeof value === 'string';

const isStatValue = (value: unknown): value is StatValue =>
  isFiniteNumber(value) || typeof value === 'string' || typeof value === 'boolean';

/** The entries of a stats record that hold a value we can show; anything else is left out. */
const parseStatRecord = (value: unknown): Record<string, StatValue> | undefined => {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, StatValue] => isStatValue(entry[1]))
  );
};

const parseStream = (value: unknown): CallStatsStream | undefined => {
  if (!isRecord(value)) return undefined;
  const stats = parseStatRecord(value.stats);
  if (!isString(value.kind) || !isFiniteNumber(value.ssrc) || !stats) return undefined;
  return {
    kind: value.kind,
    ssrc: value.ssrc,
    codec: optional(value.codec, isString),
    sdpFmtpLine: optional(value.sdpFmtpLine, isString),
    stats,
    remote: parseStatRecord(value.remote),
    source: parseStatRecord(value.source),
    participant: optional(value.participant, isString),
    track: optional(value.track, isString),
  };
};

const parseStreams = (value: unknown): CallStatsStream[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const streams = value.map(parseStream);
  return streams.every((s): s is CallStatsStream => s !== undefined) ? streams : undefined;
};

const parseConnection = (value: unknown): CallStatsConnection | undefined => {
  if (!isRecord(value) || !isString(value.host) || !isRecord(value.transport)) return undefined;
  const { transport } = value;
  const outbound = parseStreams(value.outbound);
  const inbound = parseStreams(value.inbound);
  if (
    !(value.rtt === null || isFiniteNumber(value.rtt)) ||
    !isFiniteNumber(transport.bytesSent) ||
    !isFiniteNumber(transport.bytesReceived) ||
    !outbound ||
    !inbound
  ) {
    return undefined;
  }
  return {
    host: value.host,
    rtt: value.rtt,
    transport: {
      availableOutgoingBitrate: optional(transport.availableOutgoingBitrate, isFiniteNumber),
      bytesSent: transport.bytesSent,
      bytesReceived: transport.bytesReceived,
      protocol: optional(transport.protocol, isString),
    },
    outbound,
    inbound,
  };
};

/**
 * Reads the call widget's `club.stablecat.pinniped.call_stats` payload. A sample with any
 * malformed part is dropped whole, so the graphs never mix a partial sample into the series.
 */
export const parseCallStatsSample = (data: unknown): CallStatsSample | undefined => {
  if (!isRecord(data) || !isFiniteNumber(data.time) || !Array.isArray(data.connections)) {
    return undefined;
  }
  const connections = data.connections.map(parseConnection);
  if (!connections.every((c): c is CallStatsConnection => c !== undefined)) return undefined;
  return { time: data.time, connections };
};

export type StatPoint = { time: number; value: number };

/** How much history the graphs keep and show. */
export const STATS_WINDOW_MS = 5 * 60 * 1000;

export const trimStats = (samples: CallStatsSample[]): CallStatsSample[] => {
  const newest = samples[samples.length - 1]?.time ?? 0;
  const first = samples.findIndex((s) => s.time >= newest - STATS_WINDOW_MS);
  return first > 0 ? samples.slice(first) : samples;
};

export const statNumber = (
  record: Record<string, StatValue> | undefined,
  key: string
): number | undefined => {
  const v = record?.[key];
  return typeof v === 'number' ? v : undefined;
};

/** A series from one value per sample; samples without a value are skipped. */
export const valueSeries = (
  samples: CallStatsSample[],
  pick: (s: CallStatsSample) => number | undefined
): StatPoint[] =>
  samples.flatMap((s) => {
    const value = pick(s);
    return value === undefined ? [] : [{ time: s.time, value }];
  });

/** A per-second rate from a cumulative counter, scaled by `scale` (8 for bytes -> bits). */
export const rateSeries = (
  samples: CallStatsSample[],
  pick: (s: CallStatsSample) => number | undefined,
  scale = 1
): StatPoint[] => {
  const points = valueSeries(samples, pick);
  return points.slice(1).map((p, i) => {
    const dt = (p.time - points[i].time) / 1000;
    return {
      time: p.time,
      value: dt > 0 ? Math.max(0, ((p.value - points[i].value) * scale) / dt) : 0,
    };
  });
};

export const findStream = (
  connection: CallStatsConnection | undefined,
  direction: 'outbound' | 'inbound',
  ssrc: number
): CallStatsStream | undefined => connection?.[direction].find((s) => s.ssrc === ssrc);

export const formatBytes = (v: number): string => {
  if (v < 1000) return `${Math.round(v)} bytes`;
  const units = ['KB', 'MB', 'GB'];
  let n = v;
  let i = -1;
  do {
    n /= 1000;
    i += 1;
  } while (n >= 1000 && i < units.length - 1);
  return `${n.toFixed(2)} ${units[i]}`;
};

export const formatBitrate = (bps: number): string =>
  bps >= 1e6 ? `${(bps / 1e6).toFixed(2)} Mbps` : `${(bps / 1e3).toFixed(2)} Kbps`;

/** Compact axis label: 1500 -> "1.5 k". */
export const formatAxis = (v: number): string => {
  if (v >= 1e6) return `${+(v / 1e6).toFixed(1)} M`;
  if (v >= 1e3) return `${+(v / 1e3).toFixed(1)} k`;
  return `${+v.toFixed(2)}`;
};

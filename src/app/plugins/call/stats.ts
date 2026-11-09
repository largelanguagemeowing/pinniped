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

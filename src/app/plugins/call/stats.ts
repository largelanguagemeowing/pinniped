import type { CallStatsSample } from './Call';
import type { CallStatsConnection, CallStatsStream, StatValue } from './engine/livekit/callStats';

export type StatPoint = { time: number; value: number };

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

/**
 * How much a cumulative counter grew over each interval. An interval where it went back (a
 * restarted stream) has no point.
 */
export const deltaSeries = (
  samples: CallStatsSample[],
  pick: (s: CallStatsSample) => number | undefined
): StatPoint[] => {
  const points = valueSeries(samples, pick);
  return points.slice(1).flatMap((p, i) => {
    const grew = p.value - points[i].value;
    return grew >= 0 ? [{ time: p.time, value: grew }] : [];
  });
};

/**
 * How much one cumulative counter grew per unit another grew, over each interval, scaled
 * (`scale` 1000 for seconds -> ms). An interval where `per` did not grow, or a counter went
 * back (a restarted stream), has no point.
 */
export const ratioSeries = (
  samples: CallStatsSample[],
  of: (s: CallStatsSample) => number | undefined,
  per: (s: CallStatsSample) => number | undefined,
  scale = 1
): StatPoint[] => {
  const counters = samples.flatMap((s) => {
    const a = of(s);
    const b = per(s);
    return a === undefined || b === undefined ? [] : [{ time: s.time, of: a, per: b }];
  });
  return counters.slice(1).flatMap((c, i) => {
    const grew = c.of - counters[i].of;
    const base = c.per - counters[i].per;
    return base > 0 && grew >= 0 ? [{ time: c.time, value: (grew * scale) / base }] : [];
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

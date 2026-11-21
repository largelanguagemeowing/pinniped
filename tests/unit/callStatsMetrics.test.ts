import { describe, expect, it, vi } from 'vitest';
import type { CallStatsSample } from '../../src/app/plugins/call/Call';
import type {
  CallStatsConnection,
  CallStatsStream,
  StatValue,
} from '../../src/app/plugins/call/engine/livekit/callStats';
import { ratioSeries } from '../../src/app/plugins/call/stats';
import { INBOUND_CHARTS, seriesFor } from '../../src/app/features/call-status/stats/metrics';
import { buildCallReport } from '../../src/app/features/call-status/stats/report';

vi.mock('../../src/app/utils/device', () => ({ APP_VERSION: 'v0 (test)', isDesktop: () => false }));

const SSRC = 1;
const RATE = 48000;

const inbound = (kind: string, stats: Record<string, StatValue>): CallStatsStream => ({
  kind,
  ssrc: SSRC,
  codec: kind === 'audio' ? 'audio/opus' : 'video/H264',
  stats,
  participant: '@alice:example.org',
  track: kind === 'audio' ? 'Microphone' : 'Screen share',
});

const connection = (stream: CallStatsStream): CallStatsConnection => ({
  host: 'sfu.example.org',
  rtt: 20,
  transport: { bytesSent: 0, bytesReceived: 0 },
  outbound: [],
  inbound: [stream],
});

/** One sample a second, each the stream's cumulative counters at that time. */
const samplesOf = (kind: string, counters: Record<string, StatValue>[]): CallStatsSample[] =>
  counters.map((stats, i) => ({ time: i * 1000, connections: [connection(inbound(kind, stats))] }));

const metric = (title: string) => {
  const spec = INBOUND_CHARTS.find((s) => s.title === title);
  if (!spec) throw new Error(`no metric ${title}`);
  return spec;
};

const values = (samples: CallStatsSample[], title: string): number[] =>
  seriesFor(samples, 0, 'inbound', SSRC, metric(title)).map((p) => p.value);

/** Accumulates per-second audio playout into the browser's cumulative counters. */
function audioCounters(
  seconds: {
    concealed?: number;
    silent?: number;
    slowed?: number;
    spedUp?: number;
    /** Jitter buffer delay of each emitted sample that second, in seconds; none while nothing plays out. */
    delay?: number;
  }[]
): Record<string, StatValue>[] {
  const c = {
    totalSamplesReceived: 0,
    concealedSamples: 0,
    silentConcealedSamples: 0,
    insertedSamplesForDeceleration: 0,
    removedSamplesForAcceleration: 0,
    jitterBufferDelay: 0,
    jitterBufferTargetDelay: 0,
    jitterBufferEmittedCount: 0,
    bytesReceived: 0,
  };
  const out: Record<string, StatValue>[] = [{ ...c }];
  for (const s of seconds) {
    c.totalSamplesReceived += RATE;
    c.concealedSamples += ((s.concealed ?? 0) + (s.silent ?? 0)) * RATE;
    c.silentConcealedSamples += (s.silent ?? 0) * RATE;
    c.insertedSamplesForDeceleration += (s.slowed ?? 0) * RATE;
    c.removedSamplesForAcceleration += (s.spedUp ?? 0) * RATE;
    if (s.delay !== undefined) {
      c.jitterBufferDelay += s.delay * RATE;
      c.jitterBufferTargetDelay += s.delay * RATE;
      c.jitterBufferEmittedCount += RATE;
    }
    c.bytesReceived += 8000;
    out.push({ ...c });
  }
  return out;
}

describe('ratioSeries', () => {
  /** Two counters sampled once a second, as [of, per] pairs. */
  const series = (pairs: [number, number][], scale?: number) => {
    const samples = pairs.map((_, i) => ({ time: i * 1000, connections: [] }));
    const at = (s: CallStatsSample) => pairs[s.time / 1000];
    return ratioSeries(
      samples,
      (s) => at(s)[0],
      (s) => at(s)[1],
      scale
    );
  };

  it('divides what each counter grew by over each interval, not over the stream lifetime', () => {
    const points = series(
      [
        [0, 0],
        [2, 100],
        [22, 200],
      ],
      1000
    );
    expect(points.map((p) => p.value)).toEqual([20, 200]);
    expect(points.map((p) => p.time)).toEqual([1000, 2000]);
  });

  it('leaves out intervals where the divisor did not grow or a counter went back', () => {
    const points = series([
      [0, 0],
      [1, 10],
      [1, 10],
      [0, 5],
      [2, 15],
    ]);
    expect(points.map((p) => [p.time, p.value])).toEqual([
      [1000, 0.1],
      [4000, 0.2],
    ]);
  });
});

describe('inbound audio playout metrics', () => {
  it('tells silence while a sender is muted apart from audio made up for dropouts', () => {
    const samples = samplesOf(
      'audio',
      audioCounters([{ delay: 0.04 }, { silent: 1 }, { concealed: 0.2, delay: 0.04 }])
    );
    expect(values(samples, 'Concealed (Audible)')).toEqual([0, 0, 20]);
    expect(values(samples, 'Concealed (Silent)')).toEqual([0, 100, 0]);
  });

  it('shows the jitter buffer delay of each interval, and none while nothing plays out', () => {
    const samples = samplesOf(
      'audio',
      audioCounters([{ delay: 0.02 }, { delay: 0.2 }, { silent: 1 }, { delay: 0.05 }])
    );
    const delays = seriesFor(samples, 0, 'inbound', SSRC, metric('Jitter Buffer Delay'));
    expect(delays.map((p) => [p.time, p.value])).toEqual([
      [1000, 20],
      [2000, 200],
      [4000, 50],
    ]);
  });

  it('shows how much audio was stretched to shrink or grow the jitter buffer', () => {
    const samples = samplesOf(
      'audio',
      audioCounters([
        { slowed: 0.05, delay: 0.04 },
        { spedUp: 0.1, delay: 0.04 },
      ])
    );
    expect(values(samples, 'Slowed Down')).toEqual([5, 0]);
    expect(values(samples, 'Sped Up')).toEqual([0, 10]);
  });
});

describe('call report', () => {
  const report = (samples: CallStatsSample[]) =>
    buildCallReport({
      samples,
      who: () => 'Alice',
      roomName: 'Room',
      roomId: '!room:example.org',
      encrypted: true,
      playback: undefined,
      outputName: () => 'Default',
    });

  /** The Last, Average, Min and Max cells of a metric's row in the stream's section, as numbers. */
  const row = (text: string, title: string): number[] | undefined => {
    const stream = text.slice(text.indexOf('\n### '));
    const line = stream.split('\n').find((l) => l.startsWith(`| ${title} |`));
    return line
      ?.split('|')
      .slice(2, 6)
      .map((cell) => Number.parseFloat(cell.trim()));
  };

  it('summarises the per-interval playout metrics of an inbound audio stream', () => {
    const text = report(
      samplesOf(
        'audio',
        audioCounters([
          { delay: 0.02 },
          { delay: 0.2, concealed: 0.1 },
          { silent: 1 },
          { delay: 0.05, slowed: 0.02 },
        ])
      )
    );
    expect(row(text, 'Jitter Buffer Delay')).toEqual([50, 90, 20, 200]);
    expect(row(text, 'Concealed (Audible)')).toEqual([0, 2.5, 0, 10]);
    expect(row(text, 'Concealed (Silent)')).toEqual([0, 25, 0, 100]);
    expect(row(text, 'Slowed Down')).toEqual([2, 0.5, 0, 2]);
    // Rates and running totals keep their summaries.
    expect(row(text, 'Bitrate')).toEqual([64, 64, 64, 64]);
    expect(row(text, 'Bytes Received')?.[0]).toBe(32);
    expect(row(text, 'Bytes Received')?.slice(1).every(Number.isNaN)).toBe(true);
  });

  it('only lists the metrics the browser reports for a stream', () => {
    const text = report(
      samplesOf('video', [
        { jitterBufferDelay: 0, jitterBufferTargetDelay: 0, jitterBufferEmittedCount: 0 },
        { jitterBufferDelay: 1.5, jitterBufferTargetDelay: 1, jitterBufferEmittedCount: 15 },
      ])
    );
    expect(row(text, 'Jitter Buffer Delay')).toEqual([100, 100, 100, 100]);
    expect(row(text, 'Concealed (Audible)')).toBeUndefined();
    expect(row(text, 'Slowed Down')).toBeUndefined();
  });
});

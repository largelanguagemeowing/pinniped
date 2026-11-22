import { describe, expect, it, vi } from 'vitest';
import type { CallStatsSample } from '../../src/app/plugins/call/Call';
import type {
  CallStatsConnection,
  CallStatsStream,
  QualityLimitationDurations,
  StatValue,
} from '../../src/app/plugins/call/engine/livekit/callStats';
import { deltaSeries, ratioSeries } from '../../src/app/plugins/call/stats';
import {
  INBOUND_CHARTS,
  OUTBOUND_CHARTS,
  outboundRows,
  seriesFor,
} from '../../src/app/features/call-status/stats/metrics';
import type { EncryptionEvent } from '../../src/app/plugins/call/engine/livekit/encryptionLog';
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

/** Our camera, with the encoder's `qualityLimitationDurations` record when the browser reports it. */
const camera = (
  stats: Record<string, StatValue>,
  qualityLimitationDurations?: QualityLimitationDurations
): CallStatsStream => ({
  kind: 'video',
  ssrc: SSRC,
  codec: 'video/VP8',
  stats,
  qualityLimitationDurations,
  track: 'Camera',
});

type Direction = 'outbound' | 'inbound';

const connection = (direction: Direction, stream: CallStatsStream): CallStatsConnection => ({
  host: 'sfu.example.org',
  rtt: 20,
  transport: { bytesSent: 0, bytesReceived: 0 },
  outbound: direction === 'outbound' ? [stream] : [],
  inbound: direction === 'inbound' ? [stream] : [],
});

/** One sample a second, each the stream as it was at that time. */
const samplesOfStreams = (direction: Direction, streams: CallStatsStream[]): CallStatsSample[] =>
  streams.map((stream, i) => ({ time: i * 1000, connections: [connection(direction, stream)] }));

/** One sample a second, each the inbound stream's cumulative counters at that time. */
const samplesOf = (kind: string, counters: Record<string, StatValue>[]): CallStatsSample[] =>
  samplesOfStreams(
    'inbound',
    counters.map((stats) => inbound(kind, stats))
  );

const CHARTS = { outbound: OUTBOUND_CHARTS, inbound: INBOUND_CHARTS };

const metric = (title: string, direction: Direction = 'inbound') => {
  const spec = CHARTS[direction].find((s) => s.title === title);
  if (!spec) throw new Error(`no metric ${title}`);
  return spec;
};

/** A metric's points as [time, value]. */
const pointsOf = (
  samples: CallStatsSample[],
  title: string,
  direction: Direction = 'inbound'
): [number, number][] =>
  seriesFor(samples, 0, direction, SSRC, metric(title, direction)).map((p) => [p.time, p.value]);

const values = (samples: CallStatsSample[], title: string, direction: Direction = 'inbound') =>
  pointsOf(samples, title, direction).map(([, value]) => value);

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

/** Accumulates per-second video playout into the browser's cumulative counters. */
function videoCounters(
  seconds: {
    /** Seconds of gaps between rendered frames; 0 while no frame renders. Defaults to 1. */
    played?: number;
    /** Lengths in seconds of the freezes that ended that second; part of `played`. */
    freezes?: number[];
  }[]
): Record<string, StatValue>[] {
  const c = { freezeCount: 0, totalFreezesDuration: 0, totalInterFrameDelay: 0, bytesReceived: 0 };
  const out: Record<string, StatValue>[] = [{ ...c }];
  for (const s of seconds) {
    const freezes = s.freezes ?? [];
    c.freezeCount += freezes.length;
    c.totalFreezesDuration += freezes.reduce((a, b) => a + b, 0);
    c.totalInterFrameDelay += s.played ?? 1;
    c.bytesReceived += 100000;
    out.push({ ...c });
  }
  return out;
}

/** Accumulates the encoder's per-second quality limitation into the browser's cumulative counters. */
function encoderCounters(
  seconds: { cpu?: number; bandwidth?: number; other?: number; resolutionChanges?: number }[]
): CallStatsStream[] {
  const d: QualityLimitationDurations = { none: 0, cpu: 0, bandwidth: 0, other: 0 };
  let changes = 0;
  const now = () => camera({ qualityLimitationResolutionChanges: changes }, { ...d });
  const out = [now()];
  for (const s of seconds) {
    const cpu = s.cpu ?? 0;
    const bandwidth = s.bandwidth ?? 0;
    const other = s.other ?? 0;
    d.cpu += cpu;
    d.bandwidth += bandwidth;
    d.other += other;
    d.none += 1 - cpu - bandwidth - other;
    changes += s.resolutionChanges ?? 0;
    out.push(now());
  }
  return out;
}

describe('deltaSeries', () => {
  it('gives how much a counter grew over each interval, leaving out one where it went back', () => {
    const counts = [0, 1, 1, 3, 0, 2];
    const samples = counts.map((_, i) => ({ time: i * 1000, connections: [] }));
    const points = deltaSeries(samples, (s) => counts[s.time / 1000]);
    expect(points.map((p) => [p.time, p.value])).toEqual([
      [1000, 1],
      [2000, 0],
      [3000, 2],
      [5000, 2],
    ]);
  });
});

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

describe('inbound video freezes', () => {
  it('counts the freezes of each interval and the share of the video played that was frozen', () => {
    const samples = samplesOf(
      'video',
      videoCounters([{}, { freezes: [0.5] }, { freezes: [0.25, 0.25] }, {}])
    );
    expect(values(samples, 'Freezes')).toEqual([0, 1, 2, 0]);
    expect(values(samples, 'Frozen')).toEqual([0, 50, 50, 0]);
  });

  it('shows a long freeze in the interval it ends, and no share while no frame renders', () => {
    const samples = samplesOf(
      'video',
      videoCounters([{}, { played: 0 }, { played: 0 }, { played: 4, freezes: [3] }])
    );
    expect(pointsOf(samples, 'Freezes')).toEqual([
      [1000, 0],
      [2000, 0],
      [3000, 0],
      [4000, 1],
    ]);
    expect(pointsOf(samples, 'Frozen')).toEqual([
      [1000, 0],
      [4000, 75],
    ]);
  });

  it('leaves out the interval in which the counters restart, as when a stream is replaced', () => {
    const samples = samplesOf('video', [
      ...videoCounters([{ freezes: [0.5] }, {}]),
      ...videoCounters([{ freezes: [0.25] }]),
    ]);
    expect(pointsOf(samples, 'Freezes')).toEqual([
      [1000, 1],
      [2000, 0],
      [4000, 1],
    ]);
    expect(pointsOf(samples, 'Frozen')).toEqual([
      [1000, 50],
      [2000, 0],
      [4000, 25],
    ]);
  });

  it('has no points for a browser that does not report freezes', () => {
    const samples = samplesOf('video', [
      { framesDecoded: 0, totalInterFrameDelay: 0 },
      { framesDecoded: 30, totalInterFrameDelay: 1 },
    ]);
    expect(values(samples, 'Freezes')).toEqual([]);
    expect(values(samples, 'Frozen')).toEqual([]);
  });
});

describe('outbound video quality limitation', () => {
  const outbound = (streams: CallStatsStream[]) => samplesOfStreams('outbound', streams);

  it('shows the share of each interval the encoder was limited by CPU and by bandwidth', () => {
    const samples = outbound(
      encoderCounters([
        {},
        { cpu: 0.5 },
        { bandwidth: 1 },
        { cpu: 0.25, bandwidth: 0.25, other: 0.5 },
      ])
    );
    expect(values(samples, 'Quality Limited (CPU)', 'outbound')).toEqual([0, 50, 0, 25]);
    expect(values(samples, 'Quality Limited (Bandwidth)', 'outbound')).toEqual([0, 0, 100, 25]);
  });

  it('counts the resolution changes of each interval', () => {
    const samples = outbound(
      encoderCounters([{ resolutionChanges: 1 }, {}, { bandwidth: 1, resolutionChanges: 3 }])
    );
    expect(values(samples, 'Resolution Changes (Limited)', 'outbound')).toEqual([1, 0, 3]);
  });

  it('leaves out the interval in which the counters restart, as when the encoder is replaced', () => {
    const samples = outbound([
      ...encoderCounters([{ cpu: 0.5, resolutionChanges: 1 }, { bandwidth: 1 }]),
      ...encoderCounters([{ cpu: 0.25, bandwidth: 0.25, resolutionChanges: 2 }]),
    ]);
    expect(pointsOf(samples, 'Quality Limited (CPU)', 'outbound')).toEqual([
      [1000, 50],
      [2000, 0],
      [4000, 25],
    ]);
    expect(pointsOf(samples, 'Quality Limited (Bandwidth)', 'outbound')).toEqual([
      [1000, 0],
      [2000, 100],
      [4000, 25],
    ]);
    expect(pointsOf(samples, 'Resolution Changes (Limited)', 'outbound')).toEqual([
      [1000, 1],
      [2000, 0],
      [4000, 2],
    ]);
  });

  it('has no points for a stream without quality limitation stats', () => {
    const samples = outbound([camera({ bytesSent: 0 }), camera({ bytesSent: 1000 })]);
    expect(values(samples, 'Quality Limited (CPU)', 'outbound')).toEqual([]);
    expect(values(samples, 'Quality Limited (Bandwidth)', 'outbound')).toEqual([]);
    expect(values(samples, 'Resolution Changes (Limited)', 'outbound')).toEqual([]);
  });

  it('warns while the encoder is limited, and has no reason when the browser reports none', () => {
    const limitation = (stats: Record<string, StatValue>) =>
      outboundRows(camera(stats)).find(([label]) => label === 'Quality Limitation');
    expect(limitation({ qualityLimitationReason: 'bandwidth' })?.slice(1)).toEqual([
      'Bandwidth',
      true,
    ]);
    expect(limitation({ qualityLimitationReason: 'none' })?.[2]).toBe(false);
    expect(limitation({})?.[1]).toBeUndefined();
  });
});

describe('call report', () => {
  const report = (samples: CallStatsSample[], encryptionEvents: EncryptionEvent[] = []) =>
    buildCallReport({
      samples,
      who: () => 'Alice',
      roomName: 'Room',
      roomId: '!room:example.org',
      encrypted: true,
      encryptionEvents,
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

  it('counts concealment episodes and discarded packets of an inbound audio stream', () => {
    const text = report(
      samplesOf('audio', [
        { concealmentEvents: 0, packetsDiscarded: 0 },
        { concealmentEvents: 3, packetsDiscarded: 1 },
        { concealmentEvents: 3, packetsDiscarded: 4 },
      ])
    );
    expect(row(text, 'Concealment Events')).toEqual([0, 1.5, 0, 3]);
    expect(row(text, 'Packets Discarded')?.[0]).toBe(4);
  });

  it('lists encryption events of an encrypted call, oldest first', () => {
    const events: EncryptionEvent[] = [
      {
        kind: 'failure',
        time: Date.UTC(2026, 0, 1, 12, 0, 1, 250),
        identity: 'x',
        participant: '@alice:example.org',
        local: false,
        reason: 'MissingKey',
        message: 'missing key at index 11',
      },
      {
        kind: 'key',
        time: Date.UTC(2026, 0, 1, 12, 0, 3),
        identity: 'x',
        participant: '@alice:example.org',
        local: false,
        keyIndex: 12,
      },
      {
        kind: 'key',
        time: Date.UTC(2026, 0, 1, 12, 0, 4),
        identity: 'me',
        local: true,
        keyIndex: 0,
      },
    ];
    const text = report(samplesOf('audio', audioCounters([{}])), events);
    const section = text.slice(text.indexOf('## Encryption events'), text.indexOf('## Connection'));
    expect(section).toContain(
      '| 12:00:01.250 | Alice | failure: MissingKey | missing key at index 11 |'
    );
    expect(section).toContain('| 12:00:03.000 | Alice | key received | index 12 |');
    expect(section).toContain('| 12:00:04.000 | You | key received | index 0 |');
    expect(section.indexOf('12:00:01')).toBeLessThan(section.indexOf('12:00:03'));
  });

  it('says when an encrypted call had no encryption events, and omits the section without encryption', () => {
    const samples = samplesOf('audio', audioCounters([{}]));
    expect(report(samples)).toContain('No key arrivals or decryption failures');
    const plain = buildCallReport({
      samples,
      who: () => 'Alice',
      roomName: 'Room',
      roomId: '!room:example.org',
      encrypted: false,
      encryptionEvents: [],
      playback: undefined,
      outputName: () => 'Default',
    });
    expect(plain).not.toContain('Encryption events');
  });

  it('summarises the freezes of an inbound video stream', () => {
    const text = report(
      samplesOf('video', videoCounters([{ freezes: [0.5] }, {}, { freezes: [0.25, 0.25] }, {}]))
    );
    expect(row(text, 'Freezes')).toEqual([0, 0.75, 0, 2]);
    expect(row(text, 'Frozen')).toEqual([0, 25, 0, 50]);
  });

  it('summarises the quality limitation of an outbound video stream', () => {
    const text = report(
      samplesOfStreams(
        'outbound',
        encoderCounters([{ cpu: 0.5 }, { bandwidth: 1, resolutionChanges: 1 }, {}, {}])
      )
    );
    expect(row(text, 'Quality Limited (CPU)')).toEqual([0, 12.5, 0, 50]);
    expect(row(text, 'Quality Limited (Bandwidth)')).toEqual([0, 25, 0, 100]);
    expect(row(text, 'Resolution Changes (Limited)')).toEqual([0, 0.25, 0, 1]);
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
    expect(row(text, 'Freezes')).toBeUndefined();
    expect(row(text, 'Frozen')).toBeUndefined();
  });

  it('lists no quality limitation for a stream whose browser does not report it', () => {
    const text = report(
      samplesOfStreams('outbound', [camera({ bytesSent: 0 }), camera({ bytesSent: 1000 })])
    );
    expect(row(text, 'Bitrate')).toEqual([8, 8, 8, 8]);
    expect(row(text, 'Quality Limited (CPU)')).toBeUndefined();
    expect(row(text, 'Quality Limited (Bandwidth)')).toBeUndefined();
    expect(row(text, 'Resolution Changes (Limited)')).toBeUndefined();
    expect(text).not.toContain('Quality Limitation');
  });
});

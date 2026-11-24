import type { CallStatsSample } from '../../../plugins/call/Call';
import type {
  CallStatsStream,
  QualityLimitationReason,
} from '../../../plugins/call/engine/livekit/callStats';
import {
  deltaSeries,
  findStream,
  formatBitrate,
  formatBytes,
  rateSeries,
  ratioSeries,
  StatPoint,
  statNumber,
  valueSeries,
} from '../../../plugins/call/stats';

type Pick = (stream: CallStatsStream) => number | undefined;

/** One metric of a stream: a graph in the stats view, a row in the call report. */
export type ChartSpec = {
  title: string;
  format: (v: number) => string;
} & (
  | { kind: 'value'; pick: Pick }
  // A running total: only its current value means anything in a summary.
  | { kind: 'total'; pick: Pick }
  // A cumulative counter per second, scaled.
  | { kind: 'rate'; pick: Pick; scale: number }
  // How much a cumulative counter grew over each interval.
  | { kind: 'delta'; pick: Pick }
  // How much one cumulative counter grew per unit another grew over each interval, scaled.
  | { kind: 'ratio'; of: Pick; per: Pick; scale: number }
);

const count = (v: number) => `${Math.round(v)}`;
/** Events in an interval: whole numbers, except in an average. */
const events = (v: number) => `${+v.toFixed(2)}`;
const fps = (v: number) => `${Math.round(v)}`;
const ms = (v: number) => `${v.toFixed(1)} ms`;
const percent = (v: number) => `${v.toFixed(2)}%`;

const scaled = (v: number | undefined, scale: number) => (v === undefined ? undefined : v * scale);
const field =
  (key: string, scale = 1): Pick =>
  (s) =>
    scaled(statNumber(s.stats, key), scale);
const remoteField =
  (key: string, scale = 1): Pick =>
  (s) =>
    scaled(statNumber(s.remote, key), scale);

/** Concealment made up to cover missing audio, as opposed to silence while nothing arrives. */
const audibleConcealed: Pick = (s) => {
  const concealed = statNumber(s.stats, 'concealedSamples');
  const silent = statNumber(s.stats, 'silentConcealedSamples');
  return concealed === undefined || silent === undefined ? undefined : concealed - silent;
};
/** Every sample played out, concealed and stretched ones included. */
const played = field('totalSamplesReceived');

const limitedBy =
  (reason: QualityLimitationReason): Pick =>
  (s) =>
    s.qualityLimitationDurations?.[reason];
/** The time the encoder ran, limited or not. */
const encoderTime: Pick = (s) => {
  const d = s.qualityLimitationDurations;
  return d && d.none + d.cpu + d.bandwidth + d.other;
};

export const OUTBOUND_CHARTS: ChartSpec[] = [
  { title: 'Bitrate', kind: 'rate', pick: field('bytesSent'), scale: 8, format: formatBitrate },
  { title: 'Bitrate (Target)', kind: 'value', pick: field('targetBitrate'), format: formatBitrate },
  { title: 'Bytes Sent', kind: 'total', pick: field('bytesSent'), format: formatBytes },
  { title: 'Frame Rate (Encode)', kind: 'value', pick: field('framesPerSecond'), format: fps },
  {
    title: 'Frame Rate (Input)',
    kind: 'value',
    pick: (s) => statNumber(s.source, 'framesPerSecond'),
    format: fps,
  },
  { title: 'Key Frames Encoded', kind: 'total', pick: field('keyFramesEncoded'), format: count },
  { title: 'Packets Sent', kind: 'total', pick: field('packetsSent'), format: count },
  { title: 'QP Sum', kind: 'total', pick: field('qpSum'), format: count },
  // Shares of the encoder's time it lowered the resolution or frame rate for want of CPU or bandwidth.
  {
    title: 'Quality Limited (Bandwidth)',
    kind: 'ratio',
    of: limitedBy('bandwidth'),
    per: encoderTime,
    scale: 100,
    format: percent,
  },
  {
    title: 'Quality Limited (CPU)',
    kind: 'ratio',
    of: limitedBy('cpu'),
    per: encoderTime,
    scale: 100,
    format: percent,
  },
  {
    title: 'Resolution Changes (Limited)',
    kind: 'delta',
    pick: field('qualityLimitationResolutionChanges'),
    format: events,
  },
  {
    title: 'Packets Lost (Remote)',
    kind: 'total',
    pick: remoteField('packetsLost'),
    format: count,
  },
  { title: 'Jitter (Remote)', kind: 'value', pick: remoteField('jitter', 1000), format: ms },
];

export const INBOUND_CHARTS: ChartSpec[] = [
  { title: 'Bitrate', kind: 'rate', pick: field('bytesReceived'), scale: 8, format: formatBitrate },
  { title: 'Bytes Received', kind: 'total', pick: field('bytesReceived'), format: formatBytes },
  { title: 'Packets Received', kind: 'total', pick: field('packetsReceived'), format: count },
  { title: 'Packets Lost', kind: 'total', pick: field('packetsLost'), format: count },
  { title: 'Jitter', kind: 'value', pick: field('jitter', 1000), format: ms },
  // How long media waits in our jitter buffer before it plays: the delay added on top of the network's.
  {
    title: 'Jitter Buffer Delay',
    kind: 'ratio',
    of: field('jitterBufferDelay'),
    per: field('jitterBufferEmittedCount'),
    scale: 1000,
    format: ms,
  },
  {
    title: 'Jitter Buffer Delay (Target)',
    kind: 'ratio',
    of: field('jitterBufferTargetDelay'),
    per: field('jitterBufferEmittedCount'),
    scale: 1000,
    format: ms,
  },
  { title: 'Frame Rate', kind: 'value', pick: field('framesPerSecond'), format: fps },
  { title: 'Frames Decoded', kind: 'total', pick: field('framesDecoded'), format: count },
  { title: 'Freezes', kind: 'delta', pick: field('freezeCount'), format: events },
  // Share of the video played that was frozen. The browser adds a freeze, and the gap between
  // frames it was, when the frame that ends it arrives: a long freeze shows in the interval it ends.
  {
    title: 'Frozen',
    kind: 'ratio',
    of: field('totalFreezesDuration'),
    per: field('totalInterFrameDelay'),
    scale: 100,
    format: percent,
  },
  // Shares of the audio played: made up for audio that was missing (heard as dropouts), silence
  // while nothing arrives (a muted sender), and stretched to shrink or grow the jitter buffer.
  {
    title: 'Concealed (Audible)',
    kind: 'ratio',
    of: audibleConcealed,
    per: played,
    scale: 100,
    format: percent,
  },
  {
    title: 'Concealed (Silent)',
    kind: 'ratio',
    of: field('silentConcealedSamples'),
    per: played,
    scale: 100,
    format: percent,
  },
  // How often audio went missing, whatever the share of it: many short dropouts and one long one
  // can conceal the same amount.
  { title: 'Concealment Events', kind: 'delta', pick: field('concealmentEvents'), format: events },
  // Packets the jitter buffer threw away (late, or for audio already played): they arrived, so
  // the network delivered them, but too late to use.
  { title: 'Packets Discarded', kind: 'total', pick: field('packetsDiscarded'), format: count },
  {
    title: 'Slowed Down',
    kind: 'ratio',
    of: field('insertedSamplesForDeceleration'),
    per: played,
    scale: 100,
    format: percent,
  },
  {
    title: 'Sped Up',
    kind: 'ratio',
    of: field('removedSamplesForAcceleration'),
    per: played,
    scale: 100,
    format: percent,
  },
];

export const seriesFor = (
  samples: CallStatsSample[],
  connIdx: number,
  direction: 'outbound' | 'inbound',
  ssrc: number,
  spec: ChartSpec
): StatPoint[] => {
  const at = (pick: Pick) => (sample: CallStatsSample) => {
    const stream = findStream(sample.connections[connIdx], direction, ssrc);
    return stream && pick(stream);
  };
  switch (spec.kind) {
    case 'rate':
      return rateSeries(samples, at(spec.pick), spec.scale);
    case 'delta':
      return deltaSeries(samples, at(spec.pick));
    case 'ratio':
      return ratioSeries(samples, at(spec.of), at(spec.per), spec.scale);
    case 'value':
    case 'total':
      return valueSeries(samples, at(spec.pick));
  }
};

export type Row = [label: string, value: string | undefined, warn?: boolean];

const str = (v: unknown): string | undefined =>
  v === undefined || v === null || v === '' ? undefined : String(v);

const resolution = (s: CallStatsStream): string | undefined => {
  const w = statNumber(s.stats, 'frameWidth');
  const h = statNumber(s.stats, 'frameHeight');
  return w && h ? `${w}x${h}` : undefined;
};

/**
 * Whether Opus runs in stereo on our side: the encoder for an outbound stream, the decoder for
 * an inbound one. An inbound "Yes" only says we would play stereo; whether the sender encodes
 * it is set by its own negotiation with the media server.
 */
const stereo = (s: CallStatsStream): string | undefined => {
  if (s.kind !== 'audio' || !s.codec) return undefined;
  return s.sdpFmtpLine?.includes('stereo=1') ? 'Yes' : 'No';
};

/** A reason the browser added since is shown as it reports it. */
const LIMITATION_LABELS = new Map<string, string>([
  ['none', 'None'],
  ['cpu', 'CPU'],
  ['bandwidth', 'Bandwidth'],
  ['other', 'Other'],
]);

export const outboundRows = (s: CallStatsStream): Row[] => {
  const frames = statNumber(s.stats, 'framesEncoded');
  const reason = str(s.stats.qualityLimitationReason);
  const encodeTime = statNumber(s.stats, 'totalEncodeTime');
  const power = s.stats.powerEfficientEncoder;
  const powerLabel = power ? 'Yes' : 'No';
  return [
    ['SSRC', str(s.ssrc)],
    ['Codec', str(s.codec)],
    ['Stereo Encoding', stereo(s)],
    [
      'Average Encode Time',
      frames && encodeTime !== undefined
        ? `${((encodeTime / frames) * 1000).toFixed(1)} ms`
        : undefined,
    ],
    ['Encoder', str(s.stats.encoderImplementation)],
    ['FIR', str(s.stats.firCount), (statNumber(s.stats, 'firCount') ?? 0) > 0],
    ['Frames Encoded', str(frames)],
    ['Frames Sent', str(s.stats.framesSent)],
    ['NACK', str(s.stats.nackCount), (statNumber(s.stats, 'nackCount') ?? 0) > 0],
    ['PLI', str(s.stats.pliCount)],
    ['Power Efficient Encoder', power === undefined ? undefined : powerLabel],
    ['Resolution', resolution(s)],
    [
      'Quality Limitation',
      reason && (LIMITATION_LABELS.get(reason) ?? reason),
      reason !== undefined && reason !== 'none',
    ],
    [
      'Input Resolution',
      statNumber(s.source, 'width') ? `${s.source?.width}x${s.source?.height}` : undefined,
    ],
  ];
};

export const inboundRows = (s: CallStatsStream): Row[] => [
  ['SSRC', str(s.ssrc)],
  ['Codec', str(s.codec)],
  ['Announced Encryption', str(s.announcedEncryption), s.announcedEncryption === 'none'],
  ['Stereo Decoding', stereo(s)],
  ['Decoder', str(s.stats.decoderImplementation)],
  ['Frames Decoded', str(s.stats.framesDecoded)],
  ['Frames Dropped', str(s.stats.framesDropped)],
  ['FIR', str(s.stats.firCount)],
  ['NACK', str(s.stats.nackCount), (statNumber(s.stats, 'nackCount') ?? 0) > 0],
  ['PLI', str(s.stats.pliCount)],
  ['Resolution', resolution(s)],
];

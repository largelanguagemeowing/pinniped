import React from 'react';
import { Box, color, Text } from 'folds';
import {
  CallStatsSample,
  CallStatsStream,
  findStream,
  formatBitrate,
  formatBytes,
  rateSeries,
  StatPoint,
  statNumber,
  valueSeries,
} from '../../../plugins/call';
import { StatChartTile } from './StatChart';

type ChartSpec = {
  title: string;
  /** Cumulative counters are shown as a rate (per second) after scaling. */
  rate?: number;
  pick: (stream: CallStatsStream) => number | undefined;
  format: (v: number) => string;
};

const count = (v: number) => `${Math.round(v)}`;
const fps = (v: number) => `${Math.round(v)}`;
const ms = (v: number) => `${v.toFixed(1)} ms`;

const field = (key: string) => (s: CallStatsStream) => statNumber(s.stats, key);
const remoteField =
  (key: string, scale = 1) =>
  (s: CallStatsStream) => {
    const v = statNumber(s.remote, key);
    return v === undefined ? undefined : v * scale;
  };

const OUTBOUND_CHARTS: ChartSpec[] = [
  { title: 'Bitrate', rate: 8, pick: field('bytesSent'), format: formatBitrate },
  { title: 'Bitrate (Target)', pick: field('targetBitrate'), format: formatBitrate },
  { title: 'Bytes Sent', pick: field('bytesSent'), format: formatBytes },
  { title: 'Frame Rate (Encode)', pick: field('framesPerSecond'), format: fps },
  {
    title: 'Frame Rate (Input)',
    pick: (s) => statNumber(s.source, 'framesPerSecond'),
    format: fps,
  },
  { title: 'Key Frames Encoded', pick: field('keyFramesEncoded'), format: count },
  { title: 'Packets Sent', pick: field('packetsSent'), format: count },
  { title: 'QP Sum', pick: field('qpSum'), format: count },
  { title: 'Packets Lost (Remote)', pick: remoteField('packetsLost'), format: count },
  { title: 'Jitter (Remote)', pick: remoteField('jitter', 1000), format: ms },
];

const INBOUND_CHARTS: ChartSpec[] = [
  { title: 'Bitrate', rate: 8, pick: field('bytesReceived'), format: formatBitrate },
  { title: 'Bytes Received', pick: field('bytesReceived'), format: formatBytes },
  { title: 'Packets Received', pick: field('packetsReceived'), format: count },
  { title: 'Packets Lost', pick: field('packetsLost'), format: count },
  {
    title: 'Jitter',
    pick: (s) => {
      const v = statNumber(s.stats, 'jitter');
      return v === undefined ? undefined : v * 1000;
    },
    format: ms,
  },
  { title: 'Frame Rate', pick: field('framesPerSecond'), format: fps },
  { title: 'Frames Decoded', pick: field('framesDecoded'), format: count },
  { title: 'Concealed Samples', pick: field('concealedSamples'), format: count },
];

type Row = [label: string, value: string | undefined, warn?: boolean];

const str = (v: unknown): string | undefined =>
  v === undefined || v === null || v === '' ? undefined : String(v);

const resolution = (s: CallStatsStream): string | undefined => {
  const w = statNumber(s.stats, 'frameWidth');
  const h = statNumber(s.stats, 'frameHeight');
  return w && h ? `${w}x${h}` : undefined;
};

const outboundRows = (s: CallStatsStream): Row[] => {
  const frames = statNumber(s.stats, 'framesEncoded');
  const encodeTime = statNumber(s.stats, 'totalEncodeTime');
  const power = s.stats.powerEfficientEncoder;
  const powerLabel = power ? 'Yes' : 'No';
  return [
    ['SSRC', str(s.ssrc)],
    ['Codec', str(s.codec)],
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
    ['Quality Limitation', str(s.stats.qualityLimitationReason)],
    [
      'Input Resolution',
      statNumber(s.source, 'width') ? `${s.source?.width}x${s.source?.height}` : undefined,
    ],
  ];
};

const inboundRows = (s: CallStatsStream): Row[] => [
  ['SSRC', str(s.ssrc)],
  ['Codec', str(s.codec)],
  ['Decoder', str(s.stats.decoderImplementation)],
  ['Frames Decoded', str(s.stats.framesDecoded)],
  ['Frames Dropped', str(s.stats.framesDropped)],
  ['FIR', str(s.stats.firCount)],
  ['NACK', str(s.stats.nackCount), (statNumber(s.stats, 'nackCount') ?? 0) > 0],
  ['PLI', str(s.stats.pliCount)],
  ['Resolution', resolution(s)],
];

export function StatRow({ label, value, warn }: { label: string; value?: string; warn?: boolean }) {
  return (
    <Box
      justifyContent="SpaceBetween"
      gap="200"
      style={{ padding: '10px 0', borderBottom: `1px solid ${color.SurfaceVariant.ContainerLine}` }}
    >
      <Text size="H6">{label}</Text>
      <Text size="T300" priority="300" style={warn ? { color: color.Warning.Main } : undefined}>
        {value}
      </Text>
    </Box>
  );
}

const seriesFor = (
  samples: CallStatsSample[],
  connIdx: number,
  direction: 'outbound' | 'inbound',
  ssrc: number,
  spec: ChartSpec
): StatPoint[] => {
  const pick = (sample: CallStatsSample) => {
    const stream = findStream(sample.connections[connIdx], direction, ssrc);
    return stream && spec.pick(stream);
  };
  return spec.rate ? rateSeries(samples, pick, spec.rate) : valueSeries(samples, pick);
};

type StreamStatsProps = {
  samples: CallStatsSample[];
  connIdx: number;
  direction: 'outbound' | 'inbound';
  stream: CallStatsStream;
};

/** Everything the browser reports about one RTP stream: facts, then graphs. */
export function StreamStats({ samples, connIdx, direction, stream }: StreamStatsProps) {
  const rows = (direction === 'outbound' ? outboundRows(stream) : inboundRows(stream)).filter(
    (r) => r[1] !== undefined
  );
  const now = samples[samples.length - 1]?.time;
  const charts = (direction === 'outbound' ? OUTBOUND_CHARTS : INBOUND_CHARTS)
    .map((spec) => ({ spec, points: seriesFor(samples, connIdx, direction, stream.ssrc, spec) }))
    .filter(({ points }) => points.length > 0);

  return (
    <Box direction="Column" gap="400">
      <Text size="H4">
        {stream.kind === 'video' ? 'Video' : 'Audio'}
        {stream.codec ? ` · ${stream.codec.replace(/^(audio|video)\//, '')}` : ''}
      </Text>
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          columnGap: 24,
        }}
      >
        {rows.map(([label, value, warn]) => (
          <StatRow key={label} label={label} value={value} warn={warn} />
        ))}
      </Box>
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 24,
        }}
      >
        {charts.map(({ spec, points }) => (
          <StatChartTile
            key={spec.title}
            title={spec.title}
            value={spec.format(points[points.length - 1].value)}
            points={points}
            now={now}
          />
        ))}
      </Box>
    </Box>
  );
}

import React from 'react';
import { Box, color, Text } from 'folds';
import type { CallStatsSample } from '../../../plugins/call/Call';
import type { CallStatsStream } from '../../../plugins/call/engine/livekit/callStats';
import { INBOUND_CHARTS, inboundRows, OUTBOUND_CHARTS, outboundRows, seriesFor } from './metrics';
import { StatChartTile } from './StatChart';

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

type StreamStatsProps = {
  samples: CallStatsSample[];
  connIdx: number;
  direction: 'outbound' | 'inbound';
  stream: CallStatsStream;
  /** Human name of the stream, e.g. "Alice · Microphone". */
  name: string;
};

/** Everything the browser reports about one RTP stream: facts, then graphs. */
export function StreamStats({ samples, connIdx, direction, stream, name }: StreamStatsProps) {
  const rows = (direction === 'outbound' ? outboundRows(stream) : inboundRows(stream)).filter(
    (r) => r[1] !== undefined
  );
  rows.unshift(['Stream', name]);
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

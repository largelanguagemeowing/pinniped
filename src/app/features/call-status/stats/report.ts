import {
  CallStatsConnection,
  CallStatsSample,
  formatBitrate,
  formatBytes,
  StatPoint,
  valueSeries,
} from '../../../plugins/call';
import { APP_VERSION, isDesktop } from '../../../utils/device';
import {
  ChartSpec,
  INBOUND_CHARTS,
  inboundRows,
  OUTBOUND_CHARTS,
  outboundRows,
  Row,
  seriesFor,
} from './StreamStats';
import { streamTitle } from './streams';

type ReportContext = {
  samples: CallStatsSample[];
  who: (userId: string) => string;
  roomName: string;
  roomId: string;
  encrypted: boolean;
};

/** Markdown table cells cannot contain pipes or newlines. */
const cell = (v: string) => v.replace(/\|/g, '\\|').replace(/\n/g, ' ');

const table = (head: string[], rows: string[][]): string =>
  [
    `| ${head.map(cell).join(' | ')} |`,
    `|${head.map(() => ' --- ').join('|')}|`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n');

/** Last, average, min and max of a series, formatted; a running total only has its last value. */
const summary = (
  title: string,
  points: StatPoint[],
  format: (v: number) => string,
  total = false
): string[] => {
  const values = points.map((p) => p.value);
  if (total) return [title, format(values[values.length - 1]), '—', '—', '—'];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return [
    title,
    format(values[values.length - 1]),
    format(avg),
    format(Math.min(...values)),
    format(Math.max(...values)),
  ];
};

const METRIC_HEAD = ['Metric', 'Last', 'Average', 'Min', 'Max'];

const duration = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
};

const transportSection = (samples: CallStatsSample[], idx: number, c: CallStatsConnection) => {
  const specs: [
    title: string,
    pick: (c: CallStatsConnection) => number | undefined,
    format: (v: number) => string,
    total?: boolean,
  ][] = [
    ['Ping', (x) => x.rtt ?? undefined, (v) => `${Math.round(v)} ms`],
    ['Available Outgoing Bitrate', (x) => x.transport.availableOutgoingBitrate, formatBitrate],
    ['Bytes Sent', (x) => x.transport.bytesSent, formatBytes, true],
    ['Bytes Received', (x) => x.transport.bytesReceived, formatBytes, true],
  ];
  const rows = specs.flatMap(([title, pick, format, total]) => {
    const points = valueSeries(samples, (s) => {
      const conn = s.connections[idx];
      return conn && pick(conn);
    });
    return points.length > 0 ? [summary(title, points, format, total)] : [];
  });
  return [
    `## Connection ${idx + 1}: ${c.host}`,
    '',
    `- Protocol: ${c.transport.protocol?.toUpperCase() ?? 'unknown'}`,
    `- Streams: ${c.outbound.length} outbound, ${c.inbound.length} inbound`,
    '',
    rows.length > 0 ? table(METRIC_HEAD, rows) : '_No transport samples yet._',
  ].join('\n');
};

const streamSection = (
  ctx: ReportContext,
  idx: number,
  direction: 'outbound' | 'inbound',
  stream: CallStatsConnection['outbound'][number]
): string => {
  const facts: Row[] = (direction === 'outbound' ? outboundRows : inboundRows)(stream).filter(
    (r) => r[1] !== undefined
  );
  const specs: ChartSpec[] = direction === 'outbound' ? OUTBOUND_CHARTS : INBOUND_CHARTS;
  const metrics = specs.flatMap((spec) => {
    const points = seriesFor(ctx.samples, idx, direction, stream.ssrc, spec);
    return points.length > 0 ? [summary(spec.title, points, spec.format, spec.total)] : [];
  });
  return [
    `### ${streamTitle(stream, ctx.who)} (${direction}, ${stream.kind})`,
    '',
    table(
      ['Field', 'Value'],
      facts.map(([label, value, warn]) => [label, `${value}${warn ? ' ⚠' : ''}`])
    ),
    ...(metrics.length > 0 ? ['', table(METRIC_HEAD, metrics)] : []),
  ].join('\n');
};

/** The whole debug view as Markdown, for pasting into a chat or an issue. */
export const buildCallReport = (ctx: ReportContext): string => {
  const { samples } = ctx;
  const first = samples[0];
  const latest = samples[samples.length - 1];
  const header = [
    '# Pinniped call report',
    '',
    `- Generated: ${new Date().toISOString()}`,
    `- App: Pinniped ${isDesktop() ? 'Desktop' : 'Web'} ${APP_VERSION}`,
    `- Browser: ${navigator.userAgent}`,
    `- Room: ${ctx.roomName} (${ctx.roomId})`,
    `- End-to-end encrypted: ${ctx.encrypted ? 'yes' : 'no'}`,
    `- History: ${samples.length} samples${
      first && latest ? ` over ${duration(latest.time - first.time)}` : ''
    }`,
  ].join('\n');
  if (!latest) return `${header}\n\n_No stats yet: the call is still connecting._\n`;

  const sections = latest.connections.flatMap((c, idx) => [
    transportSection(samples, idx, c),
    ...c.outbound.map((st) => streamSection(ctx, idx, 'outbound', st)),
    ...c.inbound.map((st) => streamSection(ctx, idx, 'inbound', st)),
  ]);
  return `${[header, ...sections].join('\n\n')}\n`;
};

import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  color,
  config,
  Icon,
  IconButton,
  Icons,
  MenuItem,
  Modal,
  Scroll,
  Text,
  Overlay,
  OverlayBackdrop,
  OverlayCenter,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import {
  CallEmbed,
  CallStatsConnection,
  formatBitrate,
  formatBytes,
  useCallStats,
  valueSeries,
} from '../../../plugins/call';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { stopPropagation } from '../../../utils/keyboard';
import { StatChartTile } from './StatChart';
import { StatRow, StreamStats } from './StreamStats';
import { streamsOf, streamTitle } from './streams';
import { buildCallReport } from './report';
import { copyToClipboard } from '../../../utils/dom';

type Direction = 'outbound' | 'inbound';
/** `transport`, or one stream as `outbound:<ssrc>` / `inbound:<ssrc>`. */
type Page = 'transport' | `${Direction}:${number}`;

const pages = (
  c: CallStatsConnection,
  who: (userId: string) => string
): { page: Page; name: string }[] => [
  { page: 'transport', name: 'Transport' },
  ...c.outbound.map((st) => ({
    page: `outbound:${st.ssrc}` as Page,
    name: streamTitle(st, who),
  })),
  ...c.inbound.map((st) => ({
    page: `inbound:${st.ssrc}` as Page,
    name: streamTitle(st, who),
  })),
];

type CallStatsDebugProps = {
  callEmbed: CallEmbed;
  requestClose: () => void;
};
/** Full WebRTC stats, one section per media server connection. */
export function CallStatsDebug({ callEmbed, requestClose }: CallStatsDebugProps) {
  const samples = useCallStats(callEmbed);
  const mx = useMatrixClient();
  const room = mx.getRoom(callEmbed.roomId);
  const who = (userId: string) => room?.getMember(userId)?.name ?? userId;
  const [selected, setSelected] = useState<{ conn: number; page: Page }>({
    conn: 0,
    page: 'transport',
  });
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copyReport = () => {
    copyToClipboard(
      buildCallReport({
        samples,
        who,
        roomName: room?.name ?? callEmbed.roomId,
        roomId: callEmbed.roomId,
        encrypted: callEmbed.room.hasEncryptionStateEvent(),
      })
    );
    setCopied(true);
  };

  const latest = samples[samples.length - 1];
  const connections = latest?.connections ?? [];
  const connection = connections[selected.conn];
  const now = latest?.time;
  const grid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 24,
  } as const;

  const transportChart = (
    title: string,
    pick: (c: NonNullable<typeof connection>) => number | undefined,
    format: (v: number) => string
  ) => {
    const points = valueSeries(samples, (s) => {
      const c = s.connections[selected.conn];
      return c && pick(c);
    });
    if (points.length === 0) return null;
    return (
      <StatChartTile
        key={title}
        title={title}
        value={format(points[points.length - 1].value)}
        points={points}
        now={now}
      />
    );
  };

  const renderTab = () => {
    if (!connection) return <Text priority="300">Waiting for stats…</Text>;
    if (selected.page === 'transport') {
      return (
        <Box direction="Column" gap="400">
          <Text size="H4">Transport - {connection.host}</Text>
          <Box style={grid}>
            {transportChart(
              'Available Outgoing Bitrate',
              (c) => c.transport.availableOutgoingBitrate,
              formatBitrate
            )}
            {transportChart('Bytes Received', (c) => c.transport.bytesReceived, formatBytes)}
            {transportChart('Bytes Sent', (c) => c.transport.bytesSent, formatBytes)}
            {transportChart(
              'Ping',
              (c) => c.rtt ?? undefined,
              (v) => `${Math.round(v)} ms`
            )}
          </Box>
          <Box style={grid}>
            <StatRow label="Hostname" value={connection.host} />
            <StatRow label="Protocol" value={connection.transport.protocol?.toUpperCase()} />
          </Box>
        </Box>
      );
    }
    const [direction, ssrc] = selected.page.split(':');
    const stream = streamsOf(connection, direction as Direction).find(
      (st) => st.ssrc === Number(ssrc)
    );
    if (!stream) return <Text priority="300">This stream is gone.</Text>;
    return (
      <StreamStats
        key={selected.page}
        samples={samples}
        connIdx={selected.conn}
        direction={direction as Direction}
        stream={stream}
        name={streamTitle(stream, who)}
      />
    );
  };

  return (
    <Overlay open backdrop={<OverlayBackdrop />}>
      <OverlayCenter>
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            clickOutsideDeactivates: true,
            onDeactivate: requestClose,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Modal
            size="500"
            variant="Background"
            style={{ width: 'min(1100px, 94vw)', height: 'min(760px, 90vh)' }}
          >
            <Box grow="Yes" style={{ minHeight: 0 }}>
              <Box
                direction="Column"
                shrink="No"
                gap="100"
                style={{
                  width: 220,
                  padding: config.space.S300,
                  background: color.Surface.Container,
                  overflowY: 'auto',
                }}
              >
                <Box direction="Column" style={{ padding: config.space.S200 }}>
                  <Text size="H4">General</Text>
                  <Text size="T300">{latest ? 'Connected' : 'Connecting'}</Text>
                </Box>
                {connections.map((c, conn) => (
                  <Box key={c.host} direction="Column" gap="100">
                    <Text
                      size="T200"
                      priority="300"
                      style={{ padding: config.space.S200 }}
                      truncate
                    >
                      RTC Debug: {c.host}
                    </Text>
                    {pages(c, who).map(({ page, name }) => (
                      <MenuItem
                        key={page}
                        size="300"
                        radii="300"
                        variant="Surface"
                        aria-pressed={selected.conn === conn && selected.page === page}
                        onClick={() => setSelected({ conn, page })}
                      >
                        <Text size="T300" truncate>
                          {name}
                        </Text>
                      </MenuItem>
                    ))}
                  </Box>
                ))}
              </Box>
              <Box direction="Column" grow="Yes" style={{ minWidth: 0 }}>
                <Box
                  justifyContent="End"
                  alignItems="Center"
                  gap="200"
                  shrink="No"
                  style={{ padding: config.space.S200 }}
                >
                  <Button
                    size="300"
                    variant={copied ? 'Success' : 'Secondary'}
                    fill="Soft"
                    radii="300"
                    before={<Icon size="100" src={copied ? Icons.Check : Icons.File} />}
                    onClick={copyReport}
                    disabled={samples.length === 0}
                  >
                    <Text size="B300">{copied ? 'Copied' : 'Copy Report'}</Text>
                  </Button>
                  <IconButton onClick={requestClose} variant="Background" size="300">
                    <Icon src={Icons.Cross} />
                  </IconButton>
                </Box>
                <Box grow="Yes" style={{ minHeight: 0 }}>
                  <Scroll hideTrack visibility="Hover" style={{ flexGrow: 1 }}>
                    <Box
                      direction="Column"
                      style={{ padding: `0 ${config.space.S500} ${config.space.S500}` }}
                    >
                      {renderTab()}
                    </Box>
                  </Scroll>
                </Box>
              </Box>
            </Box>
          </Modal>
        </FocusTrap>
      </OverlayCenter>
    </Overlay>
  );
}

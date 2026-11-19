import React, { useState } from 'react';
import { Box, Button, color, config, Icon, Icons, Menu, PopOut, RectCords, Text } from 'folds';
import FocusTrap from 'focus-trap-react';
import type { Call } from '../../../plugins/call/Call';
import { useBehavior } from '../../../plugins/call/engine/useBehavior';
import { valueSeries } from '../../../plugins/call/stats';
import { stopPropagation } from '../../../utils/keyboard';
import { StatChart } from './StatChart';
import { CallStatsDebug } from './CallStatsDebug';

/** From this ping on, audio is noticeably delayed. */
const HIGH_PING_MS = 250;

type CallStatsPopoutProps = {
  call: Call;
  anchor: RectCords | undefined;
  requestClose: () => void;
};
/** Ping graph and a link to the full WebRTC stats, opened from the "Voice Connected" label. */
export function CallStatsPopout({ call, anchor, requestClose }: CallStatsPopoutProps) {
  const samples = useBehavior(call.stats$);
  const [debug, setDebug] = useState(false);

  const ping = valueSeries(samples, (s) => s.connections[0]?.rtt ?? undefined);
  const host = samples[samples.length - 1]?.connections[0]?.host;
  const last = ping[ping.length - 1]?.value;
  const average =
    ping.length > 0 ? ping.reduce((sum, p) => sum + p.value, 0) / ping.length : undefined;
  const fmt = (v: number | undefined) => (v === undefined ? '—' : `${Math.round(v)} ms`);
  const encrypted = call.room.hasEncryptionStateEvent();

  return (
    <>
      <PopOut
        anchor={anchor}
        offset={8}
        position="Top"
        align="Start"
        content={
          <FocusTrap
            focusTrapOptions={{
              initialFocus: false,
              onDeactivate: requestClose,
              clickOutsideDeactivates: true,
              escapeDeactivates: stopPropagation,
            }}
          >
            <Menu style={{ width: 340 }}>
              <Box direction="Column" gap="300" style={{ padding: config.space.S300 }}>
                <StatChart points={ping} bare height={90} />
                <Box direction="Column" gap="100">
                  <Text size="H5">{host ?? 'Connecting…'}</Text>
                  <Text size="T300">
                    <b>Average ping:</b> {fmt(average)}
                  </Text>
                  <Text size="T300">
                    <b>Last ping:</b> {fmt(last)}
                  </Text>
                </Box>
                <Text size="T200" priority="300">
                  {last !== undefined && last >= HIGH_PING_MS
                    ? 'Your ping is high, so audio may be delayed. If the problem persists, disconnect and try again.'
                    : `You may notice delayed audio at ${HIGH_PING_MS} ms or higher. If the problem persists, disconnect and try again.`}
                </Text>
                <Button
                  size="300"
                  variant="Secondary"
                  fill="Soft"
                  radii="300"
                  before={<Icon size="100" src={Icons.Terminal} />}
                  onClick={() => setDebug(true)}
                >
                  <Text size="B300">Debug</Text>
                </Button>
                <Box
                  alignItems="Center"
                  gap="200"
                  style={{
                    color: encrypted ? color.Success.Main : color.Warning.Main,
                    padding: `${config.space.S100} 0`,
                  }}
                >
                  <Icon size="100" src={Icons.Lock} filled={encrypted} />
                  <Text size="T300" style={{ color: 'inherit' }}>
                    {encrypted ? 'Secure Connection' : 'Not end-to-end encrypted'}
                  </Text>
                </Box>
              </Box>
            </Menu>
          </FocusTrap>
        }
      />
      {debug && <CallStatsDebug call={call} requestClose={() => setDebug(false)} />}
    </>
  );
}

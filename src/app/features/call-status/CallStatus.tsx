import React, { useState } from 'react';
import { Box, color, Icon, Icons, RectCords, Spinner, Text } from 'folds';
import classNames from 'classnames';
import * as css from './styles.css';
import { CallRoomName } from './CallRoomName';
import { CallControl, CallHangupButton } from './CallControl';
import { ContainerColor } from '../../styles/ContainerColor.css';
import type { Call } from '../../plugins/call/Call';
import { useBehavior } from '../../plugins/call/engine/useBehavior';
import { CallStatsPopout } from './stats/CallStatsPopout';

type CallStatusProps = {
  call: Call;
};
/** "Voice Connected" panel for the bottom of the room list. */
export function CallStatus({ call }: CallStatusProps) {
  const { room } = call;

  const connected = useBehavior(call.vm.connected$);
  const publishError = useBehavior(call.vm.publishError$);
  const [statsCords, setStatsCords] = useState<RectCords>();

  return (
    <Box
      className={classNames(css.CallStatus, ContainerColor({ variant: 'Background' }))}
      shrink="No"
      direction="Column"
      gap="200"
    >
      <Box alignItems="Center" gap="200">
        <Box
          as="button"
          type="button"
          grow="Yes"
          alignItems="Center"
          gap="200"
          disabled={!connected}
          aria-label="Connection stats"
          aria-pressed={!!statsCords}
          onClick={(evt: React.MouseEvent<HTMLButtonElement>) =>
            setStatsCords(evt.currentTarget.getBoundingClientRect())
          }
          style={{
            minWidth: 0,
            background: 'none',
            border: 'none',
            padding: 0,
            textAlign: 'left',
            color: 'inherit',
            cursor: connected ? 'pointer' : 'default',
          }}
        >
          {connected ? (
            <Icon size="200" src={Icons.VolumeHigh} filled style={{ color: color.Success.Main }} />
          ) : (
            <Spinner variant="Secondary" size="200" />
          )}
          <Box grow="Yes" direction="Column" style={{ minWidth: 0 }}>
            <Text size="T300" style={{ color: color.Success.Main }} truncate>
              {connected ? 'Voice Connected' : 'Connecting…'}
            </Text>
            <CallRoomName room={room} plain />
          </Box>
        </Box>
        <CallStatsPopout
          call={call}
          anchor={statsCords}
          requestClose={() => setStatsCords(undefined)}
        />
        <Box shrink="No">
          <CallHangupButton call={call} />
        </Box>
      </Box>
      {publishError && (
        <Box role="alert" alignItems="Start" gap="200" style={{ color: color.Critical.Main }}>
          <Icon size="200" src={Icons.Warning} filled />
          <Box grow="Yes" direction="Column" style={{ minWidth: 0 }}>
            <Text size="T300">
              <b>{publishError.localisedTitle}</b>
            </Text>
            {publishError.localisedMessage && (
              <Text size="T200">{publishError.localisedMessage}</Text>
            )}
          </Box>
        </Box>
      )}
      <CallControl call={call} connected={connected} />
    </Box>
  );
}

import React, { useCallback } from 'react';
import { Box, color, MenuItem, RadioButton, Spinner, Text } from 'folds';
import { MatrixError } from 'matrix-js-sdk';
import { SequenceCard } from '../../../components/sequence-card';
import { SequenceCardStyle } from '../../room-settings/styles.css';
import { SettingTile } from '../../../components/setting-tile';
import { useRoom } from '../../../hooks/useRoom';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import {
  SpaceNotificationDefault as DefaultMode,
  SpaceNotificationDefaultContent,
  StateEvent,
} from '../../../../types/matrix/room';
import { useMatrixClient } from '../../../hooks/useMatrixClient';
import { useStateEvent } from '../../../hooks/useStateEvent';
import { getSpaceNotificationDefault } from '../../../utils/notificationDefaults';
import { RoomPermissionsAPI } from '../../../hooks/useRoomPermissions';

const OPTIONS: { mode: DefaultMode; label: string }[] = [
  { mode: 'all', label: 'All Messages' },
  { mode: 'mentions', label: 'Only @mentions' },
];

type SpaceNotificationDefaultProps = {
  permissions: RoomPermissionsAPI;
};
export function SpaceNotificationDefault({ permissions }: SpaceNotificationDefaultProps) {
  const mx = useMatrixClient();
  const space = useRoom();

  const canEdit = permissions.stateEvent(StateEvent.SpaceNotificationDefault, mx.getSafeUserId());
  useStateEvent(space, StateEvent.SpaceNotificationDefault);
  const current = getSpaceNotificationDefault(space);

  const [changeState, changeMode] = useAsyncCallback(
    useCallback(
      async (mode: DefaultMode) => {
        const content: SpaceNotificationDefaultContent = { mode };
        await mx.sendStateEvent(
          space.roomId,
          StateEvent.SpaceNotificationDefault as any,
          content as any
        );
      },
      [mx, space.roomId]
    )
  );
  const changing = changeState.status === AsyncStatus.Loading;

  return (
    <SequenceCard
      className={SequenceCardStyle}
      variant="SurfaceVariant"
      direction="Column"
      gap="400"
    >
      <SettingTile
        title="Default Notification Settings"
        description="Members who have not set their own notification preference for a room are notified for every message, or only when mentioned. Members' clients apply this the next time they are online."
        after={changing && <Spinner variant="Secondary" />}
      >
        <Box direction="Column" gap="100" role="radiogroup">
          {OPTIONS.map(({ mode, label }) => (
            <MenuItem
              key={mode}
              size="300"
              radii="300"
              variant="SurfaceVariant"
              role="radio"
              aria-checked={current === mode}
              disabled={!canEdit || changing}
              onClick={() => current !== mode && changeMode(mode)}
              before={
                <RadioButton
                  variant="Primary"
                  size="300"
                  checked={current === mode}
                  readOnly
                  tabIndex={-1}
                />
              }
            >
              <Text size="T300">{label}</Text>
            </MenuItem>
          ))}
        </Box>
        {changeState.status === AsyncStatus.Error && (
          <Text style={{ color: color.Critical.Main }} size="T200">
            {(changeState.error as MatrixError).message}
          </Text>
        )}
      </SettingTile>
    </SequenceCard>
  );
}

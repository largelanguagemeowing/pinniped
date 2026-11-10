import { Box, config, Icon, Menu, MenuItem, PopOut, RadioButton, RectCords, Text } from 'folds';
import React, { MouseEventHandler, ReactNode, useState } from 'react';
import FocusTrap from 'focus-trap-react';
import { Room } from 'matrix-js-sdk';
import { stopPropagation } from '../utils/keyboard';
import {
  RoomNotificationMode,
  getRoomNotificationModeIcon,
} from '../hooks/useRoomsNotificationPreferences';
import { SpaceNotificationMode } from '../../types/matrix/room';
import { AsyncStatus } from '../hooks/useAsyncCallback';
import { useSpaceNotificationMode } from '../hooks/useSpaceNotificationMode';

const MODE_LABEL: Record<SpaceNotificationMode, string> = {
  all: 'All Messages',
  mentions: 'Only @mentions',
  nothing: 'Nothing',
};

const MODE_ICON: Record<SpaceNotificationMode, RoomNotificationMode> = {
  all: RoomNotificationMode.AllMessages,
  mentions: RoomNotificationMode.SpecialMessages,
  nothing: RoomNotificationMode.Mute,
};

const MODES: SpaceNotificationMode[] = ['all', 'mentions', 'nothing'];

type SpaceNotificationModeSwitcherProps = {
  space: Room;
  children: (
    handleOpen: MouseEventHandler<HTMLButtonElement>,
    opened: boolean,
    changing: boolean,
    /** What the member currently gets from this space. */
    summary: string
  ) => ReactNode;
};
/**
 * What rooms in a space notify for when the member hasn't chosen for the room
 * itself: their own choice for the space, or else the space's default.
 */
export function SpaceNotificationModeSwitcher({
  space,
  children,
}: SpaceNotificationModeSwitcherProps) {
  const { chosen, ownerDefault, changeState, change } = useSpaceNotificationMode(space);
  const changing = changeState.status === AsyncStatus.Loading;

  const [menuCords, setMenuCords] = useState<RectCords>();
  const handleClose = () => setMenuCords(undefined);

  const handleSelect = (mode: SpaceNotificationMode | undefined) => {
    if (changing) return;
    change(mode);
    handleClose();
  };

  const options: { mode: SpaceNotificationMode | undefined; label: string }[] = [
    { mode: undefined, label: `Space default (${MODE_LABEL[ownerDefault]})` },
    ...MODES.map((mode) => ({ mode, label: MODE_LABEL[mode] })),
  ];

  return (
    <PopOut
      anchor={menuCords}
      offset={5}
      position="Right"
      align="Start"
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: handleClose,
            clickOutsideDeactivates: true,
            isKeyForward: (evt: KeyboardEvent) =>
              evt.key === 'ArrowDown' || evt.key === 'ArrowRight',
            isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp' || evt.key === 'ArrowLeft',
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu>
            <Box
              direction="Column"
              gap="100"
              role="radiogroup"
              style={{ padding: config.space.S100 }}
            >
              {options.map(({ mode, label }) => (
                <MenuItem
                  key={mode ?? 'default'}
                  size="300"
                  variant="Surface"
                  radii="300"
                  role="radio"
                  aria-checked={chosen === mode}
                  disabled={changing}
                  onClick={() => handleSelect(mode)}
                  before={
                    <Icon
                      size="100"
                      src={getRoomNotificationModeIcon(MODE_ICON[mode ?? ownerDefault])}
                    />
                  }
                  after={
                    <RadioButton
                      variant="Primary"
                      size="300"
                      checked={chosen === mode}
                      readOnly
                      tabIndex={-1}
                    />
                  }
                >
                  <Text size="T300">{label}</Text>
                </MenuItem>
              ))}
            </Box>
          </Menu>
        </FocusTrap>
      }
    >
      {children(
        (evt) => setMenuCords(evt.currentTarget.getBoundingClientRect()),
        !!menuCords,
        changing,
        MODE_LABEL[chosen ?? ownerDefault]
      )}
    </PopOut>
  );
}

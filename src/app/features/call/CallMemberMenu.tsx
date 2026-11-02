import React, { useEffect, useRef } from 'react';
import { Box, Checkbox, config, Line, Menu, MenuItem, RectCords, Text, toRem } from 'folds';
import { useNavigate } from 'react-router-dom';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { useOpenUserRoomProfile } from '../../state/hooks/userRoomProfile';
import { Slider } from '../../components/slider';
import { getDMRoomFor } from '../../utils/matrix';
import { getHomeRoomPath } from '../../pages/pathUtils';
import { useCallControlState } from '../../plugins/call';
import { CallControl } from '../../plugins/call/CallControl';
import { copyToClipboard } from '../../utils/dom';
import * as css from './styles.css';

/** Up to 200%: past 100% the widget amplifies the voice. */
const MAX_USER_VOLUME = 2;

type CheckItemProps = { label: string; checked: boolean; onToggle: () => void };
function CheckItem({ label, checked, onToggle }: CheckItemProps) {
  return (
    <MenuItem
      size="300"
      radii="300"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onToggle}
      after={<Checkbox size="200" variant="Primary" checked={checked} readOnly tabIndex={-1} />}
    >
      <Text size="B300" style={{ flexGrow: 1 }}>
        {label}
      </Text>
    </MenuItem>
  );
}

/** Your own mute and deafen in the call you are in. */
function OwnCallToggles({ control }: { control: CallControl }) {
  const { microphone, sound } = useCallControlState(control);
  return (
    <>
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <CheckItem label="Mute" checked={!microphone} onToggle={() => control.toggleMicrophone()} />
        <CheckItem label="Deafen" checked={!sound} onToggle={() => control.toggleSound()} />
      </Box>
    </>
  );
}

type CallMemberMenuProps = {
  roomId: string;
  userId: string;
  /** Where the menu was opened, so the profile card can open at the same spot. */
  cords: RectCords;
  /** Your own call's controls, when this is you in the call you are in. */
  control?: CallControl;
  requestClose: () => void;
};
/**
 * Right-click menu of a participant in a call: profile, message, and what you hear of them
 * (their voice level, muting them, muting their soundboard). The audio choices are yours
 * alone and are remembered across calls.
 */
export function CallMemberMenu({
  roomId,
  userId,
  cords,
  control,
  requestClose,
}: CallMemberMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on a click (or right-click) anywhere outside the menu, and on Escape.
  useEffect(() => {
    const onPointerDown = (evt: Event) => {
      if (evt.target instanceof Node && menuRef.current?.contains(evt.target)) return;
      requestClose();
    };
    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') requestClose();
    };
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('contextmenu', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('contextmenu', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [requestClose]);

  const mx = useMatrixClient();
  const navigate = useNavigate();
  const openUserProfile = useOpenUserRoomProfile();
  const [volumes, setVolumes] = useSetting(settingsAtom, 'callUserVolumes');
  const [mutedUsers, setMutedUsers] = useSetting(settingsAtom, 'callMutedUsers');
  const [mutedSoundboards, setMutedSoundboards] = useSetting(
    settingsAtom,
    'callSoundboardMutedUsers'
  );

  const self = userId === mx.getSafeUserId();
  const muted = mutedUsers.includes(userId);
  const soundboardMuted = mutedSoundboards.includes(userId);
  const volume = volumes[userId] ?? 1;

  const toggle = (list: string[], set: (next: string[]) => void, on: boolean) =>
    set(on ? [...list.filter((id) => id !== userId), userId] : list.filter((id) => id !== userId));

  const handleProfile = () => {
    openUserProfile(roomId, undefined, userId, cords, 'Right');
    requestClose();
  };

  // An existing direct chat opens as is; otherwise the profile card, which can start one.
  const handleMessage = () => {
    const dm = getDMRoomFor(mx, userId);
    if (dm) navigate(getHomeRoomPath(dm.roomId));
    else openUserProfile(roomId, undefined, userId, cords, 'Right');
    requestClose();
  };

  return (
    <Menu ref={menuRef} style={{ minWidth: toRem(220) }}>
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem size="300" radii="300" onClick={handleProfile}>
          <Text size="B300">Profile</Text>
        </MenuItem>
        {!self && (
          <MenuItem size="300" radii="300" onClick={handleMessage}>
            <Text size="B300">Message</Text>
          </MenuItem>
        )}
      </Box>
      {self && control && <OwnCallToggles control={control} />}
      {!self && (
        <>
          <Line variant="Surface" size="300" />
          <Box direction="Column" gap="200" style={{ padding: config.space.S300 }}>
            <Box justifyContent="SpaceBetween">
              <Text size="L400">User Volume</Text>
              <Text size="T200" priority="300">
                {Math.round(volume * 100)}%
              </Text>
            </Box>
            <Slider
              aria-label="User volume"
              value={volume}
              max={MAX_USER_VOLUME}
              onChange={(next: number) => setVolumes({ ...volumes, [userId]: next })}
              className={css.MenuSlider}
            />
          </Box>
          <Line variant="Surface" size="300" />
          <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
            <MenuItem
              size="300"
              radii="300"
              role="menuitemcheckbox"
              aria-checked={muted}
              onClick={() => toggle(mutedUsers, setMutedUsers, !muted)}
              after={
                <Checkbox size="200" variant="Primary" checked={muted} readOnly tabIndex={-1} />
              }
            >
              <Text size="B300" style={{ flexGrow: 1 }}>
                Mute
              </Text>
            </MenuItem>
            <MenuItem
              size="300"
              radii="300"
              role="menuitemcheckbox"
              aria-checked={soundboardMuted}
              onClick={() => toggle(mutedSoundboards, setMutedSoundboards, !soundboardMuted)}
              after={
                <Checkbox
                  size="200"
                  variant="Primary"
                  checked={soundboardMuted}
                  readOnly
                  tabIndex={-1}
                />
              }
            >
              <Text size="B300" style={{ flexGrow: 1 }}>
                Mute Soundboard
              </Text>
            </MenuItem>
          </Box>
        </>
      )}
      <Line variant="Surface" size="300" />
      <Box direction="Column" gap="100" style={{ padding: config.space.S100 }}>
        <MenuItem
          size="300"
          radii="300"
          onClick={() => {
            copyToClipboard(userId);
            requestClose();
          }}
        >
          <Text size="B300">Copy User ID</Text>
        </MenuItem>
      </Box>
    </Menu>
  );
}

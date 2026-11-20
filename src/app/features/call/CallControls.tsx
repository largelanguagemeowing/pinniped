import React, { MouseEventHandler, useCallback, useRef, useState } from 'react';
import {
  Box,
  Button,
  config,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Spinner,
  Text,
  Tooltip,
  TooltipProvider,
} from 'folds';
import { useAtomValue, useSetAtom } from 'jotai';
import FocusTrap from 'focus-trap-react';
import { callIdleAtom } from '../../state/call';
import { useCallFullscreen } from './useCallFullscreen';
import { settingsModalAtom } from '../../state/settingsModal';
import { SettingsPages } from '../settings';
import * as css from './styles.css';
import { MicrophoneButton, ScreenShareButton, SoundButton, VideoButton } from './Controls';
import { SoundboardButton } from '../soundboard/SoundboardButton';
import type { Call } from '../../plugins/call/Call';
import { useBehavior } from '../../plugins/call/engine/useBehavior';
import { stopPropagation } from '../../utils/keyboard';
import { InviteUserPrompt } from '../../components/invite-user-prompt';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { ScreenSharePicker } from './ScreenSharePicker';

type CallControlsProps = {
  call: Call;
};
export function CallControls({ call }: CallControlsProps) {
  const controlRef = useRef<HTMLDivElement>(null);
  const idle = useAtomValue(callIdleAtom);
  const [invitePrompt, setInvitePrompt] = useState(false);
  const [pickingShare, setPickingShare] = useState(false);
  const [fullscreen, toggleFullscreen] = useCallFullscreen();
  const { microphone, video, sound, screenshare, spotlight } = useBehavior(call.controlState$);
  // Screen share and soundboard need the media connection.
  const connected = useBehavior(call.vm.connected$);

  const [cords, setCords] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSpotlightClick = () => {
    call.toggleSpotlight();
    setCords(undefined);
  };

  const setSettingsModal = useSetAtom(settingsModalAtom);
  const handleSettingsClick = () => {
    setSettingsModal({ page: SettingsPages.CallsPage });
    setCords(undefined);
  };

  const [hangupState, hangup] = useAsyncCallback(useCallback(() => call.hangup(), [call]));
  const exiting =
    hangupState.status === AsyncStatus.Loading || hangupState.status === AsyncStatus.Success;

  return (
    <Box
      ref={controlRef}
      className={css.CallControlContainer}
      style={{
        opacity: idle ? 0 : 1,
        pointerEvents: idle ? 'none' : undefined,
        transition: 'opacity 0.3s ease',
      }}
      justifyContent="Center"
      alignItems="Center"
      gap="300"
      wrap="Wrap"
    >
      {/* Edge controls: invite on the left, fullscreen on the right. */}
      <Box className={css.EdgeControlLeft} alignItems="Center">
        <TooltipProvider
          position="Top"
          delay={500}
          tooltip={
            <Tooltip>
              <Text size="T200">Invite to Call</Text>
            </Tooltip>
          }
        >
          {(anchorRef) => (
            <IconButton
              ref={anchorRef}
              variant="Surface"
              fill="None"
              radii="400"
              size="400"
              onClick={() => setInvitePrompt(true)}
              aria-label="Invite to call"
            >
              <Icon size="400" src={Icons.UserPlus} />
            </IconButton>
          )}
        </TooltipProvider>
        {invitePrompt && (
          <InviteUserPrompt room={call.room} requestClose={() => setInvitePrompt(false)} />
        )}
      </Box>
      <Box className={css.EdgeControlRight} alignItems="Center">
        <TooltipProvider
          position="Top"
          align="End"
          delay={500}
          tooltip={
            <Tooltip>
              <Text size="T200">{fullscreen ? 'Exit Full Screen' : 'Full Screen'}</Text>
            </Tooltip>
          }
        >
          {(anchorRef) => (
            <IconButton
              ref={anchorRef}
              variant="Surface"
              fill="None"
              radii="400"
              size="400"
              onClick={toggleFullscreen}
              aria-label="Full screen"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M4 6c0-1.1.9-2 2-2h3a1 1 0 0 0 0-2H6a4 4 0 0 0-4 4v3a1 1 0 0 0 2 0V6ZM4 18c0 1.1.9 2 2 2h3a1 1 0 1 1 0 2H6a4 4 0 0 1-4-4v-3a1 1 0 1 1 2 0v3ZM18 4a2 2 0 0 1 2 2v3a1 1 0 1 0 2 0V6a4 4 0 0 0-4-4h-3a1 1 0 1 0 0 2h3ZM20 18a2 2 0 0 1-2 2h-3a1 1 0 1 0 0 2h3a4 4 0 0 0 4-4v-3a1 1 0 1 0-2 0v3Z"
                />
              </svg>
            </IconButton>
          )}
        </TooltipProvider>
      </Box>
      <Box className={css.ControlGroup} alignItems="Center" gap="100">
        <MicrophoneButton enabled={microphone} onToggle={() => call.toggleMicrophone()} />
        <SoundButton enabled={sound} onToggle={() => call.toggleSound()} />
        <VideoButton enabled={video} onToggle={() => call.toggleVideo()} />
      </Box>
      <Box className={css.ControlGroup} alignItems="Center" gap="100">
        <ScreenShareButton
          enabled={screenshare}
          // Starting a share asks for its options first; stopping one is immediate.
          onToggle={() => (screenshare ? call.stopScreenShare() : setPickingShare(true))}
          disabled={!connected}
        />
        <ScreenSharePicker
          call={call}
          open={pickingShare}
          requestClose={() => setPickingShare(false)}
        />
        <SoundboardButton call={call} variant="bar" disabled={!connected} />
        <PopOut
          anchor={cords}
          position="Top"
          align="Center"
          content={
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                onDeactivate: () => setCords(undefined),
                clickOutsideDeactivates: true,
                isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                escapeDeactivates: stopPropagation,
              }}
            >
              <Menu>
                <Box direction="Column" style={{ padding: config.space.S100 }}>
                  <MenuItem size="300" variant="Surface" radii="300" onClick={handleSpotlightClick}>
                    <Text size="B300" truncate>
                      {spotlight ? 'Grid View' : 'Spotlight View'}
                    </Text>
                  </MenuItem>
                  <MenuItem
                    size="300"
                    variant="Surface"
                    radii="300"
                    onClick={handleSettingsClick}
                    before={<Icon size="100" src={Icons.Setting} />}
                  >
                    <Text size="B300" truncate>
                      Voice & Video Settings
                    </Text>
                  </MenuItem>
                </Box>
              </Menu>
            </FocusTrap>
          }
        >
          <IconButton
            variant="Surface"
            fill="Soft"
            radii="400"
            size="400"
            onClick={handleOpenMenu}
            outlined
            aria-pressed={!!cords}
          >
            <Icon size="400" src={Icons.VerticalDots} />
          </IconButton>
        </PopOut>
      </Box>
      <Button
        className={css.EndButton}
        variant="Critical"
        fill="Solid"
        size="500"
        onClick={hangup}
        aria-label="End call"
        disabled={exiting}
      >
        {exiting ? (
          <Spinner variant="Critical" fill="Solid" size="200" />
        ) : (
          <Icon src={Icons.PhoneDown} size="300" filled />
        )}
      </Button>
    </Box>
  );
}

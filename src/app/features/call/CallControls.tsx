import React, { MouseEventHandler, useCallback, useEffect, useRef, useState } from 'react';
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
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import FocusTrap from 'focus-trap-react';
import { callFullscreenAtom, callIdleAtom } from '../../state/callEmbed';
import { settingsModalAtom } from '../../state/settingsModal';
import { SettingsPages } from '../settings';
import * as css from './styles.css';
import { MicrophoneButton, ScreenShareButton, SoundButton, VideoButton } from './Controls';
import { SoundboardButton } from '../soundboard/SoundboardButton';
import { CallEmbed, useCallControlState } from '../../plugins/call';
import { stopPropagation } from '../../utils/keyboard';
import { InviteUserPrompt } from '../../components/invite-user-prompt';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { ScreenSharePicker } from './ScreenSharePicker';

type CallControlsProps = {
  callEmbed: CallEmbed;
};
export function CallControls({ callEmbed }: CallControlsProps) {
  const controlRef = useRef<HTMLDivElement>(null);
  const idle = useAtomValue(callIdleAtom);
  const [invitePrompt, setInvitePrompt] = useState(false);
  const [pickingShare, setPickingShare] = useState(false);
  const [fullscreen, setFullscreen] = useAtom(callFullscreenAtom);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      setFullscreen(false);
    };
  }, [setFullscreen]);

  // Fullscreens the app window and hides the app chrome (see ClientLayout / PageRoot), so
  // only the call view is left.
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  };
  const { microphone, video, sound, screenshare, spotlight } = useCallControlState(
    callEmbed.control
  );

  const [cords, setCords] = useState<RectCords>();

  const handleOpenMenu: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setCords(evt.currentTarget.getBoundingClientRect());
  };

  const handleSpotlightClick = () => {
    callEmbed.control.toggleSpotlight();
    setCords(undefined);
  };

  const setSettingsModal = useSetAtom(settingsModalAtom);
  const handleSettingsClick = () => {
    setSettingsModal({ page: SettingsPages.CallsPage });
    setCords(undefined);
  };

  const handleMicrophoneToggle = useCallback(
    () => callEmbed.control.toggleMicrophone(),
    [callEmbed]
  );
  const handleVideoToggle = useCallback(() => callEmbed.control.toggleVideo(), [callEmbed]);

  const [hangupState, hangup] = useAsyncCallback(
    useCallback(() => callEmbed.hangup(), [callEmbed])
  );
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
          <InviteUserPrompt room={callEmbed.room} requestClose={() => setInvitePrompt(false)} />
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
        <MicrophoneButton enabled={microphone} onToggle={handleMicrophoneToggle} />
        <SoundButton enabled={sound} onToggle={() => callEmbed.control.toggleSound()} />
        <VideoButton enabled={video} onToggle={handleVideoToggle} />
      </Box>
      <Box className={css.ControlGroup} alignItems="Center" gap="100">
        <ScreenShareButton
          enabled={screenshare}
          // Starting a share asks for its options first; stopping one is immediate.
          onToggle={() =>
            screenshare ? callEmbed.control.stopScreenshare() : setPickingShare(true)
          }
        />
        <ScreenSharePicker
          callEmbed={callEmbed}
          open={pickingShare}
          requestClose={() => setPickingShare(false)}
        />
        <SoundboardButton callEmbed={callEmbed} variant="bar" />
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

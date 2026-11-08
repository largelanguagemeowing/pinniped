import { Box, Icon, IconButton, Icons, Spinner, Text, Tooltip, TooltipProvider } from 'folds';
import React, { useCallback, useState } from 'react';
import { useSetAtom } from 'jotai';
import { CallEmbed, useCallControlState } from '../../plugins/call';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { SoundboardButton } from '../soundboard/SoundboardButton';
import { ScreenSharePicker } from '../call/ScreenSharePicker';
import { callEmbedAtom } from '../../state/callEmbed';

type MicrophoneButtonProps = {
  enabled: boolean;
  onToggle: () => Promise<unknown>;
  disabled?: boolean;
};
function MicrophoneButton({ enabled, onToggle, disabled }: MicrophoneButtonProps) {
  const [micState, toggleMic] = useAsyncCallback(onToggle);
  const loading = micState.status === AsyncStatus.Loading;

  return (
    <TooltipProvider
      position="Top"
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? 'Turn Off Microphone' : 'Turn On Microphone'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Surface' : 'Critical'}
          fill="Soft"
          radii="300"
          size="300"
          style={{ width: '100%' }}
          onClick={toggleMic}
          outlined
          disabled={disabled || loading}
        >
          <Icon size="100" src={enabled ? Icons.Mic : Icons.MicMute} filled={!enabled} />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type SoundButtonProps = {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
};
function SoundButton({ enabled, onToggle, disabled }: SoundButtonProps) {
  return (
    <TooltipProvider
      position="Top"
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? 'Turn Off Sound' : 'Turn On Sound'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Surface' : 'Critical'}
          fill="Soft"
          radii="300"
          size="300"
          style={{ width: '100%' }}
          onClick={() => onToggle()}
          outlined
          disabled={disabled}
        >
          <Icon
            size="100"
            src={enabled ? Icons.Headphone : Icons.HeadphoneMute}
            filled={!enabled}
          />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type VideoButtonProps = {
  enabled: boolean;
  onToggle: () => Promise<unknown>;
  disabled?: boolean;
};
function VideoButton({ enabled, onToggle, disabled }: VideoButtonProps) {
  const [videoState, toggleVideo] = useAsyncCallback(onToggle);
  const loading = videoState.status === AsyncStatus.Loading;

  return (
    <TooltipProvider
      position="Top"
      tooltip={
        <Tooltip>
          <Text size="T200">{enabled ? 'Stop Camera' : 'Start Camera'}</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant={enabled ? 'Success' : 'Surface'}
          fill="Soft"
          radii="300"
          size="300"
          style={{ width: '100%' }}
          onClick={toggleVideo}
          outlined
          disabled={disabled || loading}
        >
          <Icon
            size="100"
            src={enabled ? Icons.VideoCamera : Icons.VideoCameraMute}
            filled={enabled}
          />
        </IconButton>
      )}
    </TooltipProvider>
  );
}

type ScreenShareButtonProps = {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
};
function ScreenShareButton({ enabled, onToggle, disabled }: ScreenShareButtonProps) {
  return (
    <Box grow="Yes" gap="100">
      <TooltipProvider
        position="Top"
        tooltip={
          <Tooltip>
            <Text size="T200">{enabled ? 'Stop Screenshare' : 'Start Screenshare'}</Text>
          </Tooltip>
        }
      >
        {(anchorRef) => (
          <IconButton
            ref={anchorRef}
            variant={enabled ? 'Success' : 'Surface'}
            fill="Soft"
            radii="300"
            size="300"
            style={{ flexGrow: 1 }}
            onClick={onToggle}
            outlined
            disabled={disabled}
          >
            <Icon size="100" src={Icons.ScreenShare} filled={enabled} />
          </IconButton>
        )}
      </TooltipProvider>
    </Box>
  );
}

export function CallHangupButton({
  callEmbed,
  callJoined,
}: {
  callEmbed: CallEmbed;
  callJoined: boolean;
}) {
  const setCallEmbed = useSetAtom(callEmbedAtom);
  const [hangupState, hangup] = useAsyncCallback(
    useCallback(() => callEmbed.hangup(), [callEmbed])
  );
  const exiting =
    hangupState.status === AsyncStatus.Loading || hangupState.status === AsyncStatus.Success;

  const handleHangup = () => {
    if (!callJoined) {
      setCallEmbed(undefined);
      return;
    }
    hangup();
  };

  return (
    <TooltipProvider
      position="Top"
      tooltip={
        <Tooltip>
          <Text size="T200">Disconnect</Text>
        </Tooltip>
      }
    >
      {(anchorRef) => (
        <IconButton
          ref={anchorRef}
          variant="Critical"
          fill="None"
          radii="300"
          size="300"
          onClick={handleHangup}
          disabled={exiting}
          aria-label="Disconnect"
        >
          {exiting ? (
            <Spinner variant="Critical" fill="Soft" size="50" />
          ) : (
            <Icon size="100" src={Icons.PhoneDown} filled />
          )}
        </IconButton>
      )}
    </TooltipProvider>
  );
}

/** Row of equal-width call buttons for the voice panel. */
export function CallControl({
  callEmbed,
  callJoined,
}: {
  callEmbed: CallEmbed;
  callJoined: boolean;
}) {
  const { microphone, video, sound, screenshare } = useCallControlState(callEmbed.control);

  const handleMicrophoneToggle = useCallback(
    () => callEmbed.control.toggleMicrophone(),
    [callEmbed]
  );
  const handleVideoToggle = useCallback(() => callEmbed.control.toggleVideo(), [callEmbed]);
  const [pickingShare, setPickingShare] = useState(false);

  return (
    <Box grow="Yes" gap="100">
      <Box grow="Yes">
        <MicrophoneButton
          enabled={microphone}
          onToggle={handleMicrophoneToggle}
          disabled={!callJoined}
        />
      </Box>
      <Box grow="Yes">
        <SoundButton
          enabled={sound}
          onToggle={() => callEmbed.control.toggleSound()}
          disabled={!callJoined}
        />
      </Box>
      <Box grow="Yes">
        <VideoButton enabled={video} onToggle={handleVideoToggle} disabled={!callJoined} />
      </Box>
      <Box grow="Yes">
        <ScreenShareButton
          enabled={screenshare}
          // Starting a share asks for its options first, as in the call bar.
          onToggle={() =>
            screenshare ? callEmbed.control.toggleScreenshare() : setPickingShare(true)
          }
          disabled={!callJoined}
        />
        <ScreenSharePicker
          callEmbed={callEmbed}
          open={pickingShare}
          requestClose={() => setPickingShare(false)}
        />
      </Box>
      <Box grow="Yes">
        <SoundboardButton callEmbed={callEmbed} variant="panel" disabled={!callJoined} />
      </Box>
    </Box>
  );
}

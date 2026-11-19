import { Box, Icon, IconButton, Icons, Spinner, Text, Tooltip, TooltipProvider } from 'folds';
import React, { useCallback, useState } from 'react';
import type { Call } from '../../plugins/call/Call';
import { useBehavior } from '../../plugins/call/engine/useBehavior';
import { AsyncStatus, useAsyncCallback } from '../../hooks/useAsyncCallback';
import { SoundboardButton } from '../soundboard/SoundboardButton';
import { ScreenSharePicker } from '../call/ScreenSharePicker';
import { VideoButton } from '../call/Controls';

type MicrophoneButtonProps = {
  enabled: boolean;
  onToggle: () => void;
};
function MicrophoneButton({ enabled, onToggle }: MicrophoneButtonProps) {
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
          onClick={() => onToggle()}
          outlined
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
};
function SoundButton({ enabled, onToggle }: SoundButtonProps) {
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

export function CallHangupButton({ call }: { call: Call }) {
  const [hangupState, hangup] = useAsyncCallback(useCallback(() => call.hangup(), [call]));
  const exiting =
    hangupState.status === AsyncStatus.Loading || hangupState.status === AsyncStatus.Success;

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
          onClick={hangup}
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

/**
 * Row of equal-width call buttons for the voice panel. Screen share and soundboard need the
 * media connection, so they wait for it.
 */
export function CallControl({ call, connected }: { call: Call; connected: boolean }) {
  const { microphone, video, sound, screenshare } = useBehavior(call.controlState$);
  const [pickingShare, setPickingShare] = useState(false);

  return (
    <Box grow="Yes" gap="100">
      <Box grow="Yes">
        <MicrophoneButton enabled={microphone} onToggle={() => call.toggleMicrophone()} />
      </Box>
      <Box grow="Yes">
        <SoundButton enabled={sound} onToggle={() => call.toggleSound()} />
      </Box>
      <Box grow="Yes">
        <VideoButton enabled={video} onToggle={() => call.toggleVideo()} compact />
      </Box>
      <Box grow="Yes">
        <ScreenShareButton
          enabled={screenshare}
          // Starting a share asks for its options first, as in the call bar.
          onToggle={() => (screenshare ? call.stopScreenShare() : setPickingShare(true))}
          disabled={!connected}
        />
        <ScreenSharePicker
          call={call}
          open={pickingShare}
          requestClose={() => setPickingShare(false)}
        />
      </Box>
      <Box grow="Yes">
        <SoundboardButton call={call} variant="panel" disabled={!connected} />
      </Box>
    </Box>
  );
}

import React from 'react';
import { Box, Button, Icon, Icons, Text } from 'folds';
import { SequenceCard } from '../../components/sequence-card';
import * as css from './styles.css';
import { ControlDivider, MicrophoneButton, SoundButton, VideoButton } from './Controls';
import { useIsDirectRoom, useRoom } from '../../hooks/useRoom';
import { useCallStart } from '../../hooks/useActiveCall';
import { useCall } from '../../hooks/useCall';
import { useCallPreferences } from '../../state/hooks/callPreferences';

type PrescreenControlsProps = {
  canJoin?: boolean;
};
export function PrescreenControls({ canJoin }: PrescreenControlsProps) {
  const room = useRoom();
  const call = useCall();
  const direct = useIsDirectRoom();

  const inOtherCall = call && call.roomId !== room.roomId;

  const startCall = useCallStart(direct);

  const disabled = inOtherCall || !canJoin;

  const { microphone, video, sound, toggleMicrophone, toggleVideo, toggleSound } =
    useCallPreferences();

  return (
    <SequenceCard
      className={css.ControlCard}
      variant="SurfaceVariant"
      gap="400"
      radii="500"
      // Standalone: it follows the member card, so without these it would lose its top corners.
      firstChild
      lastChild
      alignItems="Center"
      justifyContent="SpaceBetween"
      wrap="Wrap"
    >
      <Box shrink="No" alignItems="Inherit" justifyContent="SpaceBetween" gap="200">
        <MicrophoneButton enabled={microphone} onToggle={toggleMicrophone} />
        <SoundButton enabled={sound} onToggle={toggleSound} />
      </Box>
      <ControlDivider />
      <Box shrink="No" alignItems="Inherit" justifyContent="SpaceBetween" gap="200">
        <VideoButton enabled={video} onToggle={toggleVideo} />
      </Box>
      <Box grow="Yes" direction="Column">
        <Button
          className={disabled ? undefined : css.JoinVoiceButton}
          variant={disabled ? 'Secondary' : 'Success'}
          fill={disabled ? 'Soft' : 'Solid'}
          onClick={() => startCall(room, { microphone, video, sound })}
          disabled={disabled}
          before={<Icon src={Icons.Phone} size="200" filled />}
        >
          <Text size="B400">Join Voice</Text>
        </Button>
      </Box>
    </SequenceCard>
  );
}

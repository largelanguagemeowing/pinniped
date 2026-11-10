import React, { useCallback } from 'react';
import { Box, Text } from 'folds';
import { StateEvent } from '../../../types/matrix/room';
import { SoundPackContent } from '../../plugins/sound-pack';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useRoom } from '../../hooks/useRoom';
import { useRoomSoundPack } from '../../hooks/useSoundPacks';
import { usePowerLevels } from '../../hooks/usePowerLevels';
import { useRoomCreators } from '../../hooks/useRoomCreators';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { SoundPackEditor } from './SoundPackEditor';

/** A room's or space's soundboard sounds, playable by anyone in a call there. */
export function RoomSoundPack() {
  const mx = useMatrixClient();
  const room = useRoom();
  const pack = useRoomSoundPack(room);
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);
  const permissions = useRoomPermissions(creators, powerLevels);
  const canEdit = permissions.stateEvent(StateEvent.PinnipedRoomSounds, mx.getSafeUserId());

  const handleUpdate = useCallback(
    (content: SoundPackContent) =>
      mx.sendStateEvent(room.roomId, StateEvent.PinnipedRoomSounds, content, ''),
    [mx, room.roomId]
  );

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Soundboard</Text>
      <SoundPackEditor pack={pack} canEdit={canEdit} onUpdate={handleUpdate} />
    </Box>
  );
}

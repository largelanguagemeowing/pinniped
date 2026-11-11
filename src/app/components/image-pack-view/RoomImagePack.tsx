import React, { useCallback, useMemo } from 'react';
import { Room } from 'matrix-js-sdk';
import { usePowerLevels } from '../../hooks/usePowerLevels';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { ImagePackContent } from './ImagePackContent';
import { ImagePack, PackAddress, PackContent } from '../../plugins/custom-emoji';
import { useRoomImagePack } from '../../hooks/useImagePacks';
import { randomStr } from '../../utils/common';
import { useRoomPermissions } from '../../hooks/useRoomPermissions';
import { useRoomCreators } from '../../hooks/useRoomCreators';

type RoomImagePackProps = {
  room: Room;
  address: PackAddress;
};

export function RoomImagePack({ room, address }: RoomImagePackProps) {
  const mx = useMatrixClient();
  const userId = mx.getUserId()!;
  const powerLevels = usePowerLevels(room);
  const creators = useRoomCreators(room);

  const permissions = useRoomPermissions(creators, powerLevels);
  const canEditImagePack = permissions.stateEvent(address.format.stateEvent, userId);

  const fallbackPack = useMemo(() => new ImagePack(randomStr(4), {}, address), [address]);
  const imagePack = useRoomImagePack(room, address) ?? fallbackPack;

  const handleUpdate = useCallback(
    async (packContent: PackContent) => {
      await mx.sendStateEvent(
        address.roomId,
        address.format.stateEvent,
        packContent,
        address.stateKey
      );
    },
    [mx, address]
  );

  return (
    <ImagePackContent imagePack={imagePack} canEdit={canEditImagePack} onUpdate={handleUpdate} />
  );
}

import React from 'react';
import { Align, Menu, PopOut, Position, RectCords, toRem } from 'folds';
import FocusTrap from 'focus-trap-react';
import { useCloseUserRoomProfile, useUserRoomProfileState } from '../state/hooks/userRoomProfile';
import { UserRoomProfile } from './user-profile';
import { UserRoomProfileState } from '../state/userRoomProfile';
import { useAllJoinedRoomsSet, useGetRoom } from '../hooks/useGetRoom';
import { stopPropagation } from '../utils/keyboard';
import { SpaceProvider } from '../hooks/useSpace';
import { RoomProvider } from '../hooks/useRoom';

// Tall enough for the card with a collapsed, maximum-length bio.
const RESERVED_CARD_HEIGHT = 520;

const getPlacement = (
  cords: RectCords,
  position: Position
): { position: Position; align: Align } => {
  const above = cords.y;
  const below = window.innerHeight - (cords.y + cords.height);
  const need = RESERVED_CARD_HEIGHT;

  if (position === 'Left' || position === 'Right') {
    // Card top at the anchor top grows downward; otherwise bottom-align to grow upward.
    const fromTop = window.innerHeight - cords.y;
    const fromBottom = cords.y + cords.height;
    if (fromTop >= need) return { position, align: 'Start' };
    return { position, align: fromBottom > fromTop ? 'End' : 'Start' };
  }

  // Top/Bottom: grows away from the anchor, so it needs `need` px on that side.
  if (position === 'Top' && above >= need) return { position: 'Top', align: 'Start' };
  if (below >= need) return { position: 'Bottom', align: 'Start' };
  if (above >= need) return { position: 'Top', align: 'Start' };
  return { position: above > below ? 'Top' : 'Bottom', align: 'Start' };
};

function UserRoomProfileContextMenu({ state }: { state: UserRoomProfileState }) {
  const { roomId, spaceId, userId, cords, position } = state;
  const allJoinedRooms = useAllJoinedRoomsSet();
  const getRoom = useGetRoom(allJoinedRooms);
  const room = getRoom(roomId);
  const space = spaceId ? getRoom(spaceId) : undefined;

  const close = useCloseUserRoomProfile();

  if (!room) return null;

  // PopOut measures its content once, when it opens, but the profile (and its
  // bio) loads afterwards and grows the card. So pick the side/alignment from
  // the space a full card needs, so it grows away from the nearest screen edge
  // instead of getting clipped, while staying attached to the anchor.
  const placement = getPlacement(cords, position ?? 'Top');

  const card = (
    <FocusTrap
      focusTrapOptions={{
        initialFocus: false,
        onDeactivate: close,
        clickOutsideDeactivates: true,
        escapeDeactivates: stopPropagation,
      }}
    >
      <Menu style={{ width: toRem(340) }}>
        <SpaceProvider value={space ?? null}>
          <RoomProvider value={room}>
            <UserRoomProfile userId={userId} />
          </RoomProvider>
        </SpaceProvider>
      </Menu>
    </FocusTrap>
  );

  return (
    <PopOut anchor={cords} position={placement.position} align={placement.align} content={card} />
  );
}

export function UserRoomProfileRenderer() {
  const state = useUserRoomProfileState();

  if (!state) return null;
  return <UserRoomProfileContextMenu state={state} />;
}

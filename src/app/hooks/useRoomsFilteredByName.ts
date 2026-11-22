import { MatrixClient, RoomEvent } from 'matrix-js-sdk';
import { useEffect, useMemo, useReducer } from 'react';
import { getRoomName } from '../utils/room';

/** Rooms whose displayed name contains `term`, ignoring case and surrounding whitespace. */
export const filterRoomIdsByName = (
  mx: MatrixClient,
  roomIds: string[],
  term: string
): string[] => {
  const needle = term.trim().toLowerCase();
  if (!needle) return roomIds;
  return roomIds.filter((roomId) => {
    const room = mx.getRoom(roomId);
    return !!room && getRoomName(room).toLowerCase().includes(needle);
  });
};

/** `filterRoomIdsByName`, kept current while a room is renamed. */
export const useRoomsFilteredByName = (
  mx: MatrixClient,
  roomIds: string[],
  term: string
): string[] => {
  const [renames, countRename] = useReducer((count: number) => count + 1, 0);
  const filtering = term.trim() !== '';

  useEffect(() => {
    if (!filtering) return undefined;
    const handleName = () => countRename();
    mx.on(RoomEvent.Name, handleName);
    return () => {
      mx.removeListener(RoomEvent.Name, handleName);
    };
  }, [mx, filtering]);

  // `renames` invalidates the result when a name changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => filterRoomIdsByName(mx, roomIds, term), [mx, roomIds, term, renames]);
};

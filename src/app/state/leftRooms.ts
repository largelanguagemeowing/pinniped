import { MatrixClient } from 'matrix-js-sdk';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { createRoomMarks } from './roomMarks';

const leftRooms = createRoomMarks(AccountDataEvent.PinnipedLeftRooms);

/**
 * Records rooms the user explicitly left, so space auto-join never joins them
 * back. Stored in account data so it syncs across devices.
 */
export const markRoomsLeft = leftRooms.mark;

/** Forgets explicit leaves, e.g. after the user deliberately rejoined. */
export const unmarkRoomsLeft = leftRooms.unmark;

/** Leaves a room and remembers that the leave was explicit. */
export const leaveRoomExplicitly = async (mx: MatrixClient, roomId: string): Promise<void> => {
  await markRoomsLeft(mx, [roomId]);
  try {
    await mx.leave(roomId);
  } catch (err) {
    // The leave didn't happen, so don't keep a mark that would block auto-join.
    await unmarkRoomsLeft(mx, [roomId]).catch(() => undefined);
    throw err;
  }
};

export const useLeftRooms = leftRooms.useMarks;

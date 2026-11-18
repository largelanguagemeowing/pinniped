import { MatrixEvent, Room } from 'matrix-js-sdk';
import { getRoomName } from '../../utils/room';
import { getViaServers } from '../via-servers';
import { BookmarkTarget } from './msc4438';

/** What a bookmark of this event records, or `undefined` while it has no server-assigned ID. */
export const bookmarkTarget = (room: Room, mEvent: MatrixEvent): BookmarkTarget | undefined => {
  const eventId = mEvent.getId();
  if (eventId === undefined || mEvent.isSending()) return undefined;
  return {
    roomId: room.roomId,
    roomName: getRoomName(room),
    eventId,
    eventTs: mEvent.getTs(),
    sender: mEvent.getSender(),
    encrypted: mEvent.isEncrypted(),
    content: mEvent.getContent(),
    via: getViaServers(room),
  };
};

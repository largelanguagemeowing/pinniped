import { MatrixClient } from 'matrix-js-sdk';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { Membership, StateEvent } from '../../types/matrix/room';
import { createDirectGroup } from './directRoom';
import { getMDirects } from './room';

/** Other participants a direct message needs to be a group rather than one-to-one. */
const GROUP_MIN_OTHERS = 2;

const isDirectMessage = (mx: MatrixClient, roomId: string): boolean => {
  const mDirectEvent = mx.getAccountData(AccountDataEvent.Direct);
  return !!mDirectEvent && getMDirects(mDirectEvent).has(roomId);
};

/** Everyone but us who is in the room or invited to it. */
const otherParticipants = (mx: MatrixClient, roomId: string): string[] => {
  const myUserId = mx.getSafeUserId();
  const members = mx.getRoom(roomId)?.getMembers() ?? [];
  return members
    .filter(
      (m) =>
        m.userId !== myUserId &&
        (m.membership === Membership.Join || m.membership === Membership.Invite)
    )
    .map((m) => m.userId);
};

const inviteAsDirect = (mx: MatrixClient, roomId: string, userId: string, reason?: string) =>
  mx.sendStateEvent(
    roomId,
    StateEvent.RoomMember,
    { membership: Membership.Invite, is_direct: true, ...(reason ? { reason } : {}) },
    userId
  );

/** Whether inviting into this room starts a new group, which needs no invite right here. */
export const startsNewGroup = (mx: MatrixClient, roomId: string): boolean =>
  isDirectMessage(mx, roomId) && otherParticipants(mx, roomId).length < GROUP_MIN_OTHERS;

/**
 * Invites users and returns the room they end up in.
 *
 * A one-to-one direct message is never opened up: its history stays between the two people.
 * Inviting into one starts a new encrypted group with the same person plus the invitees, empty
 * of history, and returns that room. A group direct message (two or more others) takes the
 * invitees itself, as a direct message for them too, and anywhere else the users are invited
 * to the room plainly.
 */
export const inviteUsers = async (
  mx: MatrixClient,
  roomId: string,
  userIds: string[],
  reason?: string
): Promise<string> => {
  if (!isDirectMessage(mx, roomId)) {
    await Promise.all(userIds.map((userId) => mx.invite(roomId, userId, reason)));
    return roomId;
  }

  const existing = otherParticipants(mx, roomId);
  const added = userIds.filter((userId) => !existing.includes(userId));
  if (added.length === 0) return roomId;

  if (existing.length >= GROUP_MIN_OTHERS) {
    await Promise.all(added.map((userId) => inviteAsDirect(mx, roomId, userId, reason)));
    return roomId;
  }

  const groupId = await createDirectGroup(mx, existing, existing[0] ?? added[0]);
  // A separate member event, so each invitee's reason reaches them.
  await Promise.all(added.map((userId) => inviteAsDirect(mx, groupId, userId, reason)));
  return groupId;
};

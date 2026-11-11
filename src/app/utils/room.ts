import { IconName, IconSrc } from 'folds';

import {
  EventTimeline,
  EventTimelineSet,
  EventType,
  IMentions,
  IPowerLevelsContent,
  IPushRule,
  IPushRules,
  JoinRule,
  MatrixClient,
  MatrixEvent,
  MsgType,
  NotificationCountType,
  RelationType,
  ReceiptType,
  Direction,
  Room,
  RoomMember,
} from 'matrix-js-sdk';
import { CryptoBackend } from 'matrix-js-sdk/lib/common-crypto/CryptoBackend';
import { ReactionEventContent } from 'matrix-js-sdk/lib/types';
import { ReceiptContent } from 'matrix-js-sdk/lib/@types/read_receipts';
import { getLocalReadTs } from '../state/readMarkers';
import { AccountDataEvent } from '../../types/matrix/accountData';
import { isGifVideoContent } from '../../types/matrix/common';
import { getEventTimeline, getFirstLinkedTimeline } from './timeline';
import { getPollQuestion, isPollStartType } from './poll';
import { stripUnsafeTextChars } from './sanitize';
import {
  IRoomCreateContent,
  Membership,
  MessageEvent,
  NotificationType,
  RoomToParents,
  RoomType,
  StateEvent,
  UnreadInfo,
} from '../../types/matrix/room';

export const getStateEvent = (
  room: Room,
  eventType: StateEvent,
  stateKey = ''
): MatrixEvent | undefined =>
  room.getLiveTimeline().getState(EventTimeline.FORWARDS)?.getStateEvents(eventType, stateKey) ??
  undefined;

export const getStateEvents = (room: Room, eventType: StateEvent): MatrixEvent[] =>
  room.getLiveTimeline().getState(EventTimeline.FORWARDS)?.getStateEvents(eventType) ?? [];

export const getAccountData = (
  mx: MatrixClient,
  eventType: AccountDataEvent
): MatrixEvent | undefined => mx.getAccountData(eventType);

export const getMDirects = (mDirectEvent: MatrixEvent): Set<string> => {
  const roomIds = new Set<string>();
  const userIdToDirects = mDirectEvent?.getContent();

  if (userIdToDirects === undefined) return roomIds;

  Object.keys(userIdToDirects).forEach((userId) => {
    const directs = userIdToDirects[userId];
    if (Array.isArray(directs)) {
      directs.forEach((id) => {
        if (typeof id === 'string') roomIds.add(id);
      });
    }
  });

  return roomIds;
};

export const isDirectInvite = (room: Room | null, myUserId: string | null): boolean => {
  if (!room || !myUserId) return false;
  const me = room.getMember(myUserId);
  const memberEvent = me?.events?.member;
  const content = memberEvent?.getContent();
  return content?.is_direct === true;
};

export const isSpace = (room: Room | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, StateEvent.RoomCreate);
  if (!event) return false;
  return event.getContent().type === RoomType.Space;
};

export const isRoom = (room: Room | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, StateEvent.RoomCreate);
  if (!event) return true;
  return event.getContent().type !== RoomType.Space;
};

export const isUnsupportedRoom = (room: Room | null): boolean => {
  if (!room) return false;
  const event = getStateEvent(room, StateEvent.RoomCreate);
  if (!event) return true; // Consider room unsupported if m.room.create event doesn't exist
  return event.getContent().type !== undefined && event.getContent().type !== RoomType.Space;
};

export function isValidChild(mEvent: MatrixEvent): boolean {
  return (
    mEvent.getType() === StateEvent.SpaceChild &&
    Array.isArray(mEvent.getContent<{ via: string[] }>().via)
  );
}

export const getAllParents = (roomToParents: RoomToParents, roomId: string): Set<string> => {
  const allParents = new Set<string>();

  const addAllParentIds = (rId: string) => {
    if (allParents.has(rId)) return;
    allParents.add(rId);

    const parents = roomToParents.get(rId);
    parents?.forEach((id) => addAllParentIds(id));
  };
  addAllParentIds(roomId);
  allParents.delete(roomId);
  return allParents;
};

export const getSpaceChildren = (room: Room) =>
  getStateEvents(room, StateEvent.SpaceChild).reduce<string[]>((filtered, mEvent) => {
    const stateKey = mEvent.getStateKey();
    if (isValidChild(mEvent) && stateKey) {
      filtered.push(stateKey);
    }
    return filtered;
  }, []);

export const mapParentWithChildren = (
  roomToParents: RoomToParents,
  roomId: string,
  children: string[]
) => {
  const allParents = getAllParents(roomToParents, roomId);
  children.forEach((childId) => {
    if (allParents.has(childId)) {
      // Space cycle detected.
      return;
    }
    const parents = roomToParents.get(childId) ?? new Set<string>();
    parents.add(roomId);
    roomToParents.set(childId, parents);
  });
};

export const getRoomToParents = (mx: MatrixClient): RoomToParents => {
  const map: RoomToParents = new Map();
  mx.getRooms()
    .filter((room) => isSpace(room))
    .forEach((room) => mapParentWithChildren(map, room.roomId, getSpaceChildren(room)));

  return map;
};

export const getOrphanParents = (roomToParents: RoomToParents, roomId: string): string[] => {
  const parents = getAllParents(roomToParents, roomId);
  const orphanParents = Array.from(parents).filter(
    (parentRoomId) => !roomToParents.has(parentRoomId)
  );

  return orphanParents;
};

export const isMutedRule = (rule: IPushRule) =>
  // Check for empty actions (new spec) or dont_notify (deprecated)
  (rule.actions.length === 0 || rule.actions[0] === 'dont_notify') &&
  rule.conditions?.[0]?.kind === 'event_match';

export const findMutedRule = (overrideRules: IPushRule[], roomId: string) =>
  overrideRules.find((rule) => rule.rule_id === roomId && isMutedRule(rule));

export const getNotificationType = (mx: MatrixClient, roomId: string): NotificationType => {
  let roomPushRule: IPushRule | undefined;
  try {
    roomPushRule = mx.getRoomPushRule('global', roomId);
  } catch {
    roomPushRule = undefined;
  }

  if (!roomPushRule) {
    const overrideRules = mx.getAccountData(EventType.PushRules)?.getContent<IPushRules>()
      ?.global?.override;
    if (!overrideRules) return NotificationType.Default;

    return findMutedRule(overrideRules, roomId) ? NotificationType.Mute : NotificationType.Default;
  }

  if (roomPushRule.actions[0] === 'notify') return NotificationType.AllMessages;
  return NotificationType.MentionsAndKeywords;
};

const NOTIFICATION_EVENT_TYPES = [
  'm.room.create',
  'm.room.message',
  'm.room.encrypted',
  'm.room.member',
  'm.sticker',
];
export const isNotificationEvent = (mEvent: MatrixEvent) => {
  const eType = mEvent.getType();
  if (!NOTIFICATION_EVENT_TYPES.includes(eType) && !isPollStartType(eType)) {
    return false;
  }
  if (eType === 'm.room.member') return false;

  if (mEvent.isRedacted()) return false;
  if (mEvent.getRelation()?.rel_type === 'm.replace') return false;

  return true;
};

// Starting a call posts a ringing notification with `m.mentions.room`, which the
// server counts as a highlight for every member. So in a call room the server's
// highlight count can't be trusted; count the text messages that mention us.
const countCallRoomMentions = (room: Room): number => {
  const userId = room.myUserId;
  const readUpToId = room.getEventReadUpTo(userId);
  const localTs = getLocalReadTs(room.roomId);
  const liveEvents = room.getLiveTimeline().getEvents();
  const readIndex = readUpToId ? liveEvents.findIndex((e) => e.getId() === readUpToId) : -1;
  const unread =
    readIndex >= 0
      ? liveEvents.slice(readIndex + 1)
      : liveEvents.filter((e) => e.getTs() > localTs);

  return unread.filter((e) => {
    if (e.getType() !== 'm.room.message' || e.isRedacted()) return false;
    if (e.getRelation()?.rel_type === 'm.replace' || e.getSender() === userId) return false;
    const mentions = e.getContent<{ 'm.mentions'?: IMentions }>()['m.mentions'];
    return mentions?.room === true || !!mentions?.user_ids?.includes(userId);
  }).length;
};

const getHighlightCount = (room: Room): number =>
  room.isCallRoom()
    ? countCallRoomMentions(room)
    : room.getUnreadNotificationCount(NotificationCountType.Highlight);

export const roomHaveNotification = (room: Room): boolean => {
  const total = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = getHighlightCount(room);

  return total > 0 || highlight > 0;
};

export const roomHaveUnread = (mx: MatrixClient, room: Room) => {
  const userId = mx.getUserId();
  if (!userId) return false;
  const readUpToId = room.getEventReadUpTo(userId);
  const liveEvents = room.getLiveTimeline().getEvents();

  if (liveEvents[liveEvents.length - 1]?.getSender() === userId) {
    return false;
  }

  // The SDK ignores a receipt whose event is not loaded, which is the usual
  // case right after a restart (only the cached sync window is in memory). The
  // receipt's own timestamp still says when we read, so use it to tell events
  // we already read from newer ones.
  const receiptTs = Math.max(
    room.getReadReceiptForUserId(userId, false, ReceiptType.Read)?.data.ts ?? 0,
    room.getReadReceiptForUserId(userId, false, ReceiptType.ReadPrivate)?.data.ts ?? 0
  );
  // Marking a room read here remembers the newest event's timestamp, so an
  // event at exactly that time is read.
  const localTs = getLocalReadTs(room.roomId);

  // When the receipt's event is loaded, timeline order decides: timestamps can
  // tie or even run backwards (bridges, clock skew), so they must not.
  const readIndex = readUpToId ? liveEvents.findIndex((e) => e.getId() === readUpToId) : -1;
  if (readIndex >= 0) {
    return liveEvents
      .slice(readIndex + 1)
      .some((e) => isNotificationEvent(e) && e.getTs() > localTs);
  }

  for (let i = liveEvents.length - 1; i >= 0; i -= 1) {
    const event = liveEvents[i];
    if (!event) return false;
    if (isNotificationEvent(event)) return event.getTs() > localTs && event.getTs() >= receiptTs;
  }
  // Nothing in the loaded window can notify, so there is nothing unread to show.
  return false;
};

// Where a room's timeline should open: at the read receipt. Only meaningful
// while the room is actually unread. The receipt's event id can lag behind what
// roomHaveUnread() knows (a receipt the server never echoed, our own latest
// message), and honouring it then drops the user on an old message.
export const getRoomUnreadInfo = (mx: MatrixClient, room: Room, scrollTo = false) => {
  if (!roomHaveNotification(room) && !roomHaveUnread(mx, room)) return undefined;
  const readUptoEventId = room.getEventReadUpTo(mx.getUserId() ?? '');
  if (!readUptoEventId) return undefined;
  const evtTimeline = getEventTimeline(room, readUptoEventId);
  const latestTimeline = evtTimeline && getFirstLinkedTimeline(evtTimeline, Direction.Forward);
  return {
    readUptoEventId,
    inLiveTimeline: latestTimeline === room.getLiveTimeline(),
    scrollTo,
  };
};

/** Whether an `m.receipt` event carries a receipt of this user, of any receipt type. */
export const receiptIncludesUser = (mEvent: MatrixEvent, userId: string): boolean =>
  Object.values(mEvent.getContent<ReceiptContent>()).some((receiptTypes) =>
    Object.values(receiptTypes).some((users) => users[userId] !== undefined)
  );

export const getUnreadInfo = (room: Room): UnreadInfo => {
  const total = room.getUnreadNotificationCount(NotificationCountType.Total);
  const highlight = getHighlightCount(room);
  return {
    roomId: room.roomId,
    highlight,
    total: highlight > total ? highlight : total,
  };
};

export const getUnreadInfos = (mx: MatrixClient): UnreadInfo[] => {
  const unreadInfos = mx.getRooms().reduce<UnreadInfo[]>((unread, room) => {
    if (room.isSpaceRoom()) return unread;
    if (room.getMyMembership() !== 'join') return unread;
    if (getNotificationType(mx, room.roomId) === NotificationType.Mute) return unread;

    if (roomHaveNotification(room) || roomHaveUnread(mx, room)) {
      unread.push(getUnreadInfo(room));
    }

    return unread;
  }, []);
  return unreadInfos;
};

export const getRoomIconSrc = (
  icons: Record<IconName, IconSrc>,
  roomType?: string,
  joinRule?: JoinRule
): IconSrc => {
  if (roomType === RoomType.Space) {
    if (joinRule === JoinRule.Public) return icons.SpaceGlobe;
    if (
      joinRule === JoinRule.Invite ||
      joinRule === JoinRule.Knock ||
      joinRule === JoinRule.Private
    ) {
      return icons.SpaceLock;
    }
    return icons.Space;
  }

  if (roomType === RoomType.Call) {
    if (joinRule === JoinRule.Public) return icons.VolumeHighGlobe;
    if (
      joinRule === JoinRule.Invite ||
      joinRule === JoinRule.Knock ||
      joinRule === JoinRule.Private
    ) {
      return icons.VolumeHighLock;
    }
    return icons.VolumeHigh;
  }

  if (joinRule === JoinRule.Public) return icons.HashGlobe;
  if (
    joinRule === JoinRule.Invite ||
    joinRule === JoinRule.Knock ||
    joinRule === JoinRule.Private
  ) {
    return icons.HashLock;
  }
  return icons.Hash;
};

export const getRoomAvatarUrl = (
  mx: MatrixClient,
  room: Room,
  size: 32 | 96 = 32,
  useAuthentication = false
): string | undefined => {
  const mxcUrl = room.getMxcAvatarUrl();
  return mxcUrl
    ? (mx.mxcUrlToHttp(mxcUrl, size, size, 'crop', undefined, false, useAuthentication) ??
        undefined)
    : undefined;
};

export const getDirectRoomAvatarUrl = (
  mx: MatrixClient,
  room: Room,
  size: 32 | 96 = 32,
  useAuthentication = false
): string | undefined => {
  const mxcUrl = room.getAvatarFallbackMember()?.getMxcAvatarUrl();

  if (!mxcUrl) {
    return getRoomAvatarUrl(mx, room, size, useAuthentication);
  }

  return (
    mx.mxcUrlToHttp(mxcUrl, size, size, 'crop', undefined, false, useAuthentication) ?? undefined
  );
};

export const trimReplyFromBody = (body: string): string => {
  const match = body.match(/^> <.+?> .+\n(>.*\n)*?\n/m);
  if (!match) return body;
  return body.slice(match[0].length);
};

export const trimReplyFromFormattedBody = (formattedBody: string): string => {
  const suffix = '</mx-reply>';
  const i = formattedBody.lastIndexOf(suffix);
  if (i < 0) {
    return formattedBody;
  }
  return formattedBody.slice(i + suffix.length);
};

export const parseReplyBody = (userId: string, body: string) =>
  `> <${userId}> ${body.replace(/\n/g, '\n> ')}\n\n`;

export const parseReplyFormattedBody = (
  roomId: string,
  userId: string,
  eventId: string,
  formattedBody: string
): string => {
  const replyToLink = `<a href="https://matrix.to/#/${encodeURIComponent(
    roomId
  )}/${encodeURIComponent(eventId)}">In reply to</a>`;
  const userLink = `<a href="https://matrix.to/#/${encodeURIComponent(userId)}">${userId}</a>`;

  return `<mx-reply><blockquote>${replyToLink}${userLink}<br />${formattedBody}</blockquote></mx-reply>`;
};

const SPOILER_PLACEHOLDER = '[spoiler]';

// Hides spoilered text in a notification body. Prefers the formatted body, whose
// spoiler spans are authoritative; falls back to the markdown `||spoiler||` syntax.
const redactSpoilers = (content: Record<string, unknown>, body: string): string => {
  const formatted = content.formatted_body;
  if (typeof formatted === 'string' && formatted.includes('data-mx-spoiler')) {
    const doc = new DOMParser().parseFromString(formatted, 'text/html');
    doc.querySelectorAll('mx-reply').forEach((el) => el.remove());
    doc.querySelectorAll('[data-mx-spoiler]').forEach((el) => {
      el.textContent = SPOILER_PLACEHOLDER;
    });
    doc.querySelectorAll('br').forEach((el) => el.replaceWith('\n'));
    doc.querySelectorAll('p, div, li, blockquote').forEach((el) => el.append('\n'));
    return (doc.body.textContent ?? '').trim();
  }
  return body.replace(/\|\|[\s\S]+?\|\|/g, SPOILER_PLACEHOLDER);
};

// Plain-text preview for OS notification bodies; falls back to a label for non-text types.
export const getEventBodyForNotification = (mEvent: MatrixEvent): string => {
  if (mEvent.isRedacted()) return 'Message deleted';

  const eventType = mEvent.getType();
  if (isPollStartType(eventType)) {
    const question = getPollQuestion(mEvent.getContent());
    return question ? `Poll: ${question}` : 'Started a poll';
  }
  if (eventType === MessageEvent.Sticker) return 'Sent a sticker';
  if (eventType === MessageEvent.RoomMessageEncrypted) return 'Encrypted message';
  if (eventType !== MessageEvent.RoomMessage) return '';

  const content = mEvent.getContent();
  const rawBody = typeof content.body === 'string' ? trimReplyFromBody(content.body) : '';
  const body = redactSpoilers(content, rawBody);

  switch (content.msgtype) {
    case MsgType.Image:
      return 'Sent an image';
    case MsgType.Video:
      return isGifVideoContent(content) ? 'Sent a GIF' : 'Sent a video';
    case MsgType.Audio:
      return 'Sent an audio message';
    case MsgType.File:
      return 'Sent a file';
    case MsgType.Location:
      return 'Shared a location';
    case MsgType.Emote:
      return body ? `* ${body}` : '';
    case MsgType.Text:
    case MsgType.Notice:
    default:
      return body;
  }
};

export const getMemberDisplayName = (room: Room, userId: string): string | undefined => {
  const member = room.getMember(userId);
  const name = member?.rawDisplayName;
  if (name === userId) return undefined;
  // A name made only of invisible or override characters is no name at all.
  return name === undefined ? undefined : stripUnsafeTextChars(name) || undefined;
};

export const getMemberSearchStr = (
  member: RoomMember,
  query: string,
  mxIdToName: (mxId: string) => string
): string[] => [
  member.rawDisplayName === member.userId ? mxIdToName(member.userId) : member.rawDisplayName,
  query.startsWith('@') || query.indexOf(':') > -1 ? member.userId : mxIdToName(member.userId),
];

export const getMemberAvatarMxc = (room: Room, userId: string): string | undefined => {
  const member = room.getMember(userId);
  return member?.getMxcAvatarUrl();
};

export const isMembershipChanged = (mEvent: MatrixEvent): boolean =>
  mEvent.getContent().membership !== mEvent.getPrevContent().membership ||
  mEvent.getContent().reason !== mEvent.getPrevContent().reason;

export const decryptAllTimelineEvent = async (mx: MatrixClient, timeline: EventTimeline) => {
  const crypto = mx.getCrypto();
  if (!crypto) return;
  const decryptionPromises = timeline
    .getEvents()
    .filter((event) => event.isEncrypted())
    .reverse()
    .map((event) => event.attemptDecryption(crypto as CryptoBackend, { isRetry: true }));
  await Promise.allSettled(decryptionPromises);
};

/** `m.reaction` content; Pinniped also stores the emoji shortcode. */
export type ReactionContent = ReactionEventContent & { shortcode?: string };

export const getReactionContent = (
  eventId: string,
  key: string,
  shortcode?: string
): ReactionContent => ({
  'm.relates_to': {
    event_id: eventId,
    key,
    rel_type: RelationType.Annotation,
  },
  shortcode,
});

export const getEventReactions = (timelineSet: EventTimelineSet, eventId: string) =>
  timelineSet.relations.getChildEventsForEvent(
    eventId,
    RelationType.Annotation,
    EventType.Reaction
  );

export const getEventEdits = (timelineSet: EventTimelineSet, eventId: string, eventType: string) =>
  timelineSet.relations.getChildEventsForEvent(eventId, RelationType.Replace, eventType);

export const getLatestEdit = (
  targetEvent: MatrixEvent,
  editEvents: MatrixEvent[]
): MatrixEvent | undefined => {
  const eventByTargetSender = (rEvent: MatrixEvent) =>
    rEvent.getSender() === targetEvent.getSender();
  return editEvents.sort((m1, m2) => m2.getTs() - m1.getTs()).find(eventByTargetSender);
};

export const getEditedEvent = (
  mEventId: string,
  mEvent: MatrixEvent,
  timelineSet: EventTimelineSet
): MatrixEvent | undefined => {
  const edits = getEventEdits(timelineSet, mEventId, mEvent.getType());
  return edits && getLatestEdit(mEvent, edits.getRelations());
};

export const canEditEvent = (mx: MatrixClient, mEvent: MatrixEvent) => {
  const content = mEvent.getContent();
  const relationType = content['m.relates_to']?.rel_type;
  return (
    mEvent.getSender() === mx.getUserId() &&
    (!relationType || relationType === RelationType.Thread) &&
    mEvent.getType() === MessageEvent.RoomMessage &&
    (content.msgtype === MsgType.Text ||
      content.msgtype === MsgType.Emote ||
      content.msgtype === MsgType.Notice)
  );
};

export const getLatestEditableEvt = (
  timeline: EventTimeline,
  canEdit: (mEvent: MatrixEvent) => boolean
): MatrixEvent | undefined => {
  const events = timeline.getEvents();

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const evt = events[i];
    if (canEdit(evt)) return evt;
  }
  return undefined;
};

export const reactionOrEditEvent = (mEvent: MatrixEvent) =>
  mEvent.getRelation()?.rel_type === RelationType.Annotation ||
  mEvent.getRelation()?.rel_type === RelationType.Replace;

export const getMentionContent = (userIds: string[], room: boolean): IMentions => {
  const mMentions: IMentions = {};
  if (userIds.length > 0) {
    mMentions.user_ids = userIds;
  }
  if (room) {
    mMentions.room = true;
  }

  return mMentions;
};

export const getCommonRooms = (
  mx: MatrixClient,
  rooms: string[],
  otherUserId: string
): string[] => {
  const commonRooms: string[] = [];

  rooms.forEach((roomId) => {
    const room = mx.getRoom(roomId);
    if (!room || room.getMyMembership() !== Membership.Join) return;

    const common = room.hasMembershipState(otherUserId, Membership.Join);
    if (common) {
      commonRooms.push(roomId);
    }
  });

  return commonRooms;
};

export const bannedInRooms = (mx: MatrixClient, rooms: string[], otherUserId: string): boolean =>
  rooms.some((roomId) => {
    const room = mx.getRoom(roomId);
    if (!room || room.getMyMembership() !== Membership.Join) return false;

    const banned = room.hasMembershipState(otherUserId, Membership.Ban);
    return banned;
  });

export const getAllVersionsRoomCreator = (room: Room): Set<string> => {
  const creators = new Set<string>();

  const createEvent = getStateEvent(room, StateEvent.RoomCreate);
  const createContent = createEvent?.getContent<IRoomCreateContent>();
  const creator = createEvent?.getSender();
  if (typeof creator === 'string') creators.add(creator);

  if (createContent && Array.isArray(createContent.additional_creators)) {
    createContent.additional_creators.forEach((c) => {
      if (typeof c === 'string') creators.add(c);
    });
  }

  return creators;
};

export const guessPerfectParent = (
  mx: MatrixClient,
  roomId: string,
  parents: string[]
): string | undefined => {
  if (parents.length === 1) {
    return parents[0];
  }

  const getSpecialUsers = (rId: string): string[] => {
    const specialUsers: Set<string> = new Set();

    const r = mx.getRoom(rId);
    if (!r) return [];

    getAllVersionsRoomCreator(r).forEach((c) => specialUsers.add(c));

    const powerLevels = getStateEvent(
      r,
      StateEvent.RoomPowerLevels
    )?.getContent<IPowerLevelsContent>();

    const { users_default: usersDefault, users } = powerLevels ?? {};
    const defaultPower = typeof usersDefault === 'number' ? usersDefault : 0;

    if (typeof users === 'object')
      Object.keys(users).forEach((userId) => {
        if (users[userId] > defaultPower) {
          specialUsers.add(userId);
        }
      });

    return Array.from(specialUsers);
  };

  let perfectParent: string | undefined;
  let score = 0;

  const roomSpecialUsers = getSpecialUsers(roomId);
  parents.forEach((parentId) => {
    const parentSpecialUsers = getSpecialUsers(parentId);
    const matchedUsersCount = parentSpecialUsers.filter((userId) =>
      roomSpecialUsers.includes(userId)
    ).length;

    if (matchedUsersCount > score) {
      score = matchedUsersCount;
      perfectParent = parentId;
    }
  });

  return perfectParent;
};

/** The room name for display. Invisible and override characters are removed. */
export const getRoomName = (room: Room): string => stripUnsafeTextChars(room.name);

import { EventType } from 'matrix-js-sdk';
import { IImageInfo } from './common';

export enum Membership {
  Invite = 'invite',
  Knock = 'knock',
  Join = 'join',
  Leave = 'leave',
  Ban = 'ban',
}

export type IMemberContent = {
  avatar_url?: string;
  displayname?: string;
  membership?: Membership;
  reason?: string;
  is_direct?: boolean;
};

// Spec event types take their value from the SDK enum so they keep its nominal member type,
// which is what `sendStateEvent`/`sendEvent` accept. Types the SDK lacks (app-defined, or spec
// types newer than the SDK) are plain literals, registered with it in `types/matrix-js-sdk.d.ts`.
export const StateEvent = {
  RoomCanonicalAlias: EventType.RoomCanonicalAlias,
  RoomCreate: EventType.RoomCreate,
  RoomJoinRules: EventType.RoomJoinRules,
  RoomMember: EventType.RoomMember,
  RoomThirdPartyInvite: EventType.RoomThirdPartyInvite,
  RoomPowerLevels: EventType.RoomPowerLevels,
  RoomName: EventType.RoomName,
  RoomTopic: EventType.RoomTopic,
  RoomAvatar: EventType.RoomAvatar,
  RoomPinnedEvents: EventType.RoomPinnedEvents,
  RoomEncryption: EventType.RoomEncryption,
  RoomHistoryVisibility: EventType.RoomHistoryVisibility,
  RoomGuestAccess: EventType.RoomGuestAccess,
  RoomServerAcl: EventType.RoomServerAcl,
  RoomTombstone: EventType.RoomTombstone,
  GroupCallPrefix: EventType.GroupCallPrefix,
  GroupCallMemberPrefix: EventType.GroupCallMemberPrefix,

  SpaceChild: EventType.SpaceChild,
  SpaceParent: EventType.SpaceParent,

  RoomImagePack: 'm.room.image_pack',
  /** MSC2545's unstable `RoomImagePack`. */
  PoniesRoomEmotes: 'im.ponies.room_emotes',
  PinnipedRoomSounds: 'club.stablecat.pinniped.room_sounds',
  PowerLevelTags: 'in.cinny.room.power_level_tags',
  SpaceAutoJoin: 'club.stablecat.pinniped.space.auto_join',
  SpaceNotificationDefault: 'club.stablecat.pinniped.space.notification_default',
  /** Pre-rename type; still read when no `SpaceAutoJoin` event exists. */
  LegacySpaceAutoJoin: 'im.kibby.space.auto_join',
} as const;
export type StateEvent = (typeof StateEvent)[keyof typeof StateEvent];

export const MessageEvent = {
  RoomMessage: EventType.RoomMessage,
  RoomMessageEncrypted: EventType.RoomMessageEncrypted,
  Sticker: EventType.Sticker,
  RoomRedaction: EventType.RoomRedaction,
  Reaction: EventType.Reaction,
} as const;
export type MessageEvent = (typeof MessageEvent)[keyof typeof MessageEvent];

export enum RoomType {
  Space = 'm.space',
  Call = 'org.matrix.msc3417.call',
}

export type MSpaceChildContent = {
  via: string[];
  suggested?: boolean;
  order?: string;
};

export type SpaceAutoJoinContent = {
  auto_join?: boolean;
};

/** What members who have not set a room preference are notified about. */
export type SpaceNotificationDefault = 'all' | 'mentions';

/** A member's own choice for a space: the owner's options plus muting it. */
export type SpaceNotificationMode = SpaceNotificationDefault | 'nothing';

export type SpaceNotificationDefaultContent = {
  mode?: SpaceNotificationDefault;
};

export enum NotificationType {
  Default = 'default',
  AllMessages = 'all_messages',
  MentionsAndKeywords = 'mentions_and_keywords',
  Mute = 'mute',
}

export type IRoomCreateContent = {
  creator?: string;
  ['m.federate']?: boolean;
  room_version: string;
  type?: string;
  additional_creators?: string[];
  predecessor?: {
    event_id?: string;
    room_id: string;
  };
};

export type GetContentCallback = <T>() => T;

export type RoomToParents = Map<string, Set<string>>;
export type Unread = {
  total: number;
  highlight: number;
  from: Set<string> | null;
};
export type RoomToUnread = Map<string, Unread>;
export type UnreadInfo = {
  roomId: string;
  total: number;
  highlight: number;
};

export type MuteChanges = {
  added: string[];
  removed: string[];
};

export type MemberPowerTagIcon = {
  key?: string;
  info?: IImageInfo;
};
export type MemberPowerTag = {
  name: string;
  color?: string;
  icon?: MemberPowerTagIcon;
};
/** Power level -> tag, as stored in the `in.cinny.room.power_level_tags` state event. */
export type PowerLevelTags = Record<number, MemberPowerTag>;

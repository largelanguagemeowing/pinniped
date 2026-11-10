import { describe, expect, it } from 'vitest';
import { EventType } from 'matrix-js-sdk';
import { AccountDataEvent } from '../../src/types/matrix/accountData';
import { MessageEvent, StateEvent } from '../../src/types/matrix/room';

const sdkTypes = new Map(Object.entries(EventType));

// Spec event types must use the SDK's value for the member of the same name; the SDK's typed
// send/account data APIs key their maps by that nominal member.
const expectSdkValues = (constants: Record<string, string>) => {
  const mismatched = Object.entries(constants).filter(
    ([name, value]) => sdkTypes.has(name) && sdkTypes.get(name) !== value
  );
  expect(mismatched).toEqual([]);
};

describe('event type constants', () => {
  it('state events use the SDK value of the same name', () => {
    expectSdkValues(StateEvent);
  });

  it('message events use the SDK value of the same name', () => {
    expectSdkValues(MessageEvent);
  });

  it('account data events use the SDK value of the same name', () => {
    expectSdkValues(AccountDataEvent);
  });

  it('keeps the app-defined state event types', () => {
    expect(StateEvent).toMatchObject({
      PoniesRoomEmotes: 'im.ponies.room_emotes',
      PinnipedRoomSounds: 'club.stablecat.pinniped.room_sounds',
      PowerLevelTags: 'in.cinny.room.power_level_tags',
      SpaceAutoJoin: 'club.stablecat.pinniped.space.auto_join',
      SpaceNotificationDefault: 'club.stablecat.pinniped.space.notification_default',
      LegacySpaceAutoJoin: 'im.kibby.space.auto_join',
    });
  });

  it('keeps the app-defined account data types', () => {
    expect(AccountDataEvent).toMatchObject({
      CinnySpaces: 'in.cinny.spaces',
      PinnipedRoomOrder: 'club.stablecat.pinniped.room_order',
      PinnipedGifFavorites: 'club.stablecat.pinniped.gif_favorites',
      PinnipedLeftRooms: 'club.stablecat.pinniped.left_rooms',
      PinnipedStatusMessage: 'club.stablecat.pinniped.status_message',
      PinnipedUserSounds: 'club.stablecat.pinniped.user_sounds',
      PinnipedSoundFavorites: 'club.stablecat.pinniped.sound_favorites',
      PinnipedSpaceNotifications: 'club.stablecat.pinniped.space_notifications',
      PinnipedInheritedNotifications: 'club.stablecat.pinniped.inherited_notifications',
      ElementRecentEmoji: 'io.element.recent_emoji',
      PinnipedEmojiFavorites: 'club.stablecat.pinniped.emoji_favorites',
      PinnipedRecentCustomEmoji: 'club.stablecat.pinniped.recent_custom_emoji',
      PoniesUserEmotes: 'im.ponies.user_emotes',
      PoniesEmoteRooms: 'im.ponies.emote_rooms',
    });
  });
});

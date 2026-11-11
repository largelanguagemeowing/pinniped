import 'matrix-js-sdk/lib/@types/event';
import 'matrix-js-sdk/lib/@types/state_events';
import { M_POLL_RESPONSE } from 'matrix-js-sdk';
import type { PollResponseEventContent } from 'matrix-js-sdk';
import type {
  PowerLevelTags,
  SpaceAutoJoinContent,
  SpaceNotificationDefaultContent,
} from './matrix/room';

// Registers the event types Pinniped reads and writes that the SDK does not define,
// so its typed account data / state event APIs accept them.
declare module 'matrix-js-sdk/lib/@types/event' {
  interface StateEvents {
    'm.room.image_pack': Record<string, unknown>;
    'im.ponies.room_emotes': Record<string, unknown>;
    'club.stablecat.pinniped.room_sounds': Record<string, unknown>;
    'in.cinny.room.power_level_tags': PowerLevelTags;
    'club.stablecat.pinniped.space.auto_join': SpaceAutoJoinContent;
    'club.stablecat.pinniped.space.notification_default': SpaceNotificationDefaultContent;
    /** Pre-rename type; read when no `SpaceAutoJoin` event exists. */
    'im.kibby.space.auto_join': SpaceAutoJoinContent;
  }

  interface AccountDataEvents {
    'in.cinny.spaces': Record<string, unknown>;
    'club.stablecat.pinniped.room_order': Record<string, unknown>;
    'club.stablecat.pinniped.gif_favorites': Record<string, unknown>;
    'club.stablecat.pinniped.left_rooms': Record<string, unknown>;
    'club.stablecat.pinniped.status_message': { status?: string };
    'club.stablecat.pinniped.user_sounds': Record<string, unknown>;
    'club.stablecat.pinniped.sound_favorites': Record<string, unknown>;
    'club.stablecat.pinniped.space_notifications': { spaces?: Record<string, string> };
    'club.stablecat.pinniped.inherited_notifications': { rooms?: Record<string, string> };
    'm.recent_emoji': Record<string, unknown>;
    'io.element.recent_emoji': Record<string, unknown>;
    'club.stablecat.pinniped.emoji_favorites': Record<string, unknown>;
    'club.stablecat.pinniped.recent_custom_emoji': Record<string, unknown>;
    'm.image_pack.rooms': Record<string, unknown>;
    'im.ponies.user_emotes': Record<string, unknown>;
    'im.ponies.emote_rooms': Record<string, unknown>;
    // pre-rename types read by the legacy account data migration
    'im.kibby.room_order': Record<string, unknown>;
    'im.kibby.gif_favorites': Record<string, unknown>;
    'im.kibby.left_rooms': Record<string, unknown>;
  }

  // Polls are sent under MSC3381's unstable types. The SDK registers the start and end
  // events itself; the response is missing.
  interface TimelineEvents {
    [M_POLL_RESPONSE.name]: PollResponseEventContent;
  }
}

// MSC2869's `auto_join` flag; Pinniped sends it (always false) with `m.space.child`.
declare module 'matrix-js-sdk/lib/@types/state_events' {
  interface SpaceChildEventContent {
    auto_join?: boolean;
  }
}

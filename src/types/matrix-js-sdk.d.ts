import 'matrix-js-sdk/lib/@types/event';

// Registers the custom event types Pinniped reads and writes, so the SDK's
// typed account data / state event APIs accept them.
declare module 'matrix-js-sdk/lib/@types/event' {
  interface StateEvents {
    'im.ponies.room_emotes': Record<string, unknown>;
    'club.stablecat.pinniped.room_sounds': Record<string, unknown>;
  }

  interface AccountDataEvents {
    'in.cinny.spaces': Record<string, unknown>;
    'club.stablecat.pinniped.room_order': Record<string, unknown>;
    'club.stablecat.pinniped.gif_favorites': Record<string, unknown>;
    'club.stablecat.pinniped.left_rooms': Record<string, unknown>;
    'club.stablecat.pinniped.status_message': { status?: string };
    'club.stablecat.pinniped.user_sounds': Record<string, unknown>;
    'club.stablecat.pinniped.sound_favorites': Record<string, unknown>;
    'io.element.recent_emoji': Record<string, unknown>;
    'club.stablecat.pinniped.emoji_favorites': Record<string, unknown>;
    'club.stablecat.pinniped.recent_custom_emoji': Record<string, unknown>;
    'im.ponies.user_emotes': Record<string, unknown>;
    'im.ponies.emote_rooms': Record<string, unknown>;
    // pre-rename types read by the legacy account data migration
    'im.kibby.room_order': Record<string, unknown>;
    'im.kibby.gif_favorites': Record<string, unknown>;
    'im.kibby.left_rooms': Record<string, unknown>;
  }
}

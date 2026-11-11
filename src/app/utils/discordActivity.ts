// Fork-only. Maps a Discord `SET_ACTIVITY` payload (as captured by the desktop
// impersonator, see electron/rich-presence.cjs) to an MSC4320 rich-presence
// profile field value. Pure and side-effect-free so it can be unit-tested.
import { MSC4320_RPC_ACTIVITY, MSC4320_RPC_MEDIA } from '../../types/matrix/richPresence';
import type { DiscordRichPresenceActivity } from './device';

export type MediaPayload = {
  type: typeof MSC4320_RPC_MEDIA;
  artist: string;
  track: string;
  album?: string;
  progress?: { length: number; time_complete: number };
  cover_art?: string;
  player?: string;
};
export type ActivityPayload =
  | MediaPayload
  | {
      type: typeof MSC4320_RPC_ACTIVITY;
      name: string;
      details?: string;
      image?: string;
    };

export type MappedActivity = { payload: ActivityPayload; coverUrl?: string };

/** The name published for an activity whose client reported no text at all. */
export const UNNAMED_ACTIVITY = 'Unknown application';

// Discord timestamps arrive as seconds (10 digits) or ms (13). Normalise to ms.
const toMs = (ts: number | undefined): number | undefined => {
  if (ts === undefined || !Number.isFinite(ts) || ts <= 0) return undefined;
  return ts > 1e12 ? ts : ts * 1000;
};

// Only resolve http(s) image URLs; Discord also uses bare asset keys which
// aren't fetchable. SSRF protection is the homeserver's job (preview_url blocklist).
const httpUrl = (v: string | undefined): string | undefined => {
  if (!v) return undefined;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? v : undefined;
  } catch {
    return undefined;
  }
};

// Discord activity type 2 = Listening -> m.rpc.media (track = details,
// artist = state, playback window -> live progress). Everything else ->
// m.rpc.activity. The cover image URL is returned separately so the hook can
// resolve it to an MXC via the homeserver's preview_url endpoint.
export const mapDiscordActivity = (activity: DiscordRichPresenceActivity): MappedActivity => {
  const track = activity.details;
  const artist = activity.state;
  if (activity.type === 2 && track && artist) {
    const startMs = toMs(activity.timestamps?.start);
    const endMs = toMs(activity.timestamps?.end);
    const progress =
      startMs && endMs && endMs > startMs
        ? { length: Math.round((endMs - startMs) / 1000), time_complete: endMs }
        : undefined;
    return {
      payload: {
        type: MSC4320_RPC_MEDIA,
        artist,
        track,
        album: activity.assets?.large_text || undefined,
        progress,
        player: activity.name || undefined,
      },
      coverUrl: httpUrl(activity.assets?.large_image),
    };
  }
  // Clients rarely send a name: the RPC server is expected to look it up from the application
  // id, which only that server's own service can. Use the text the client did send, and never
  // put a name in the user's public profile that the client did not report.
  const name = activity.name || activity.details || activity.state || UNNAMED_ACTIVITY;
  const secondary = [activity.details, activity.state].filter(
    (v): v is string => !!v && v !== name
  );
  const details = Array.from(new Set(secondary)).join(' · ') || undefined;
  return {
    payload: { type: MSC4320_RPC_ACTIVITY, name, details },
    coverUrl: httpUrl(activity.assets?.large_image),
  };
};

export const isMediaPayload = (p: ActivityPayload): p is MediaPayload =>
  p.type === MSC4320_RPC_MEDIA;

// Merge a resolved image MXC into a payload: cover_art for media, image for
// activity. The reader renders both via mxcUrlToHttp.
export const withCoverArt = (p: ActivityPayload, mxc: string): ActivityPayload => {
  if (isMediaPayload(p)) return { ...p, cover_art: mxc };
  return { ...p, image: mxc };
};

export const sameActivityPayload = (
  a: ActivityPayload | null,
  b: ActivityPayload | null
): boolean => {
  if (a === null || b === null) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
};

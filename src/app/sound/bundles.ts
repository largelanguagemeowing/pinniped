import DefaultMessage from '../../../public/sound/notification.ogg';
import DefaultInvite from '../../../public/sound/invite.ogg';
import DefaultCall from '../../../public/sound/call.ogg';
import DefaultRingback from '../../../public/sound/call-default/ringtone.ogg';
import DefaultJoin from '../../../public/sound/call-default/join_call.ogg';
import DefaultLeave from '../../../public/sound/call-default/left_call.ogg';
import DefaultDeclined from '../../../public/sound/call-default/call_declined.ogg';
import DefaultTimeout from '../../../public/sound/call-default/call_timeout.ogg';
import DefaultRaiseHand from '../../../public/sound/call-default/raise_hand.ogg';
import DefaultScreenshareStarted from '../../../public/sound/call-default/screen_share_started.ogg';

/** Sounds every bundle can fall back to the default for. */
export type CoreSoundKind = 'message' | 'invite' | 'call';
/** Opt-in event sounds; the default bundle has none, so a bundle without one stays silent. */
export type EventSoundKind =
  | 'sent'
  | 'signin'
  | 'signout'
  | 'online'
  | 'offline'
  | 'callStart'
  | 'callEnd'
  // Sounds the embedded call plays itself: waiting for the other side to pick up, a
  // participant joining/leaving, and the call being declined or timing out.
  | 'ringback'
  | 'callJoin'
  | 'callLeave'
  | 'callDeclined'
  | 'callTimeout'
  | 'raiseHand'
  | 'screenshareStarted';
export type SoundKind = CoreSoundKind | EventSoundKind;

export const DEFAULT_SOUND_BUNDLE = 'default';

type SoundUrls = Partial<Record<SoundKind, string>>;

const BUNDLE_LABELS: Record<string, string> = {
  icq: 'ICQ 7',
  'icq-classic': 'ICQ (classic)',
  'skype-classic-7x': 'Skype (classic 7.x)',
};

const files = import.meta.glob<string>('./bundles/*/*.{ogg,mp3,wav}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const bundles: Record<string, SoundUrls> = {
  [DEFAULT_SOUND_BUNDLE]: {
    message: DefaultMessage,
    invite: DefaultInvite,
    call: DefaultCall,
    ringback: DefaultRingback,
    callJoin: DefaultJoin,
    callLeave: DefaultLeave,
    callDeclined: DefaultDeclined,
    callTimeout: DefaultTimeout,
    raiseHand: DefaultRaiseHand,
    screenshareStarted: DefaultScreenshareStarted,
  },
};

Object.entries(files).forEach(([path, url]) => {
  const match = path.match(
    /^\.\/bundles\/([^/]+)\/(message|invite|call|sent|signin|signout|online|offline|callStart|callEnd|ringback|callJoin|callLeave|callDeclined|callTimeout|raiseHand|screenshareStarted)\.[^.]+$/
  );
  if (!match) return;
  const [, bundle, kind] = match;
  bundles[bundle] = { ...bundles[bundle], [kind as SoundKind]: url };
});

// A bundle without a message sound would be silent for the main use case.
export const soundBundles: { id: string; name: string }[] = Object.keys(bundles)
  .filter((id) => bundles[id].message)
  .map((id) => ({ id, name: id === DEFAULT_SOUND_BUNDLE ? 'Default' : (BUNDLE_LABELS[id] ?? id) }));

export const getSoundUrl = (bundle: string, kind: SoundKind): string | undefined =>
  bundles[bundle]?.[kind] ?? bundles[DEFAULT_SOUND_BUNDLE][kind];

export const getCoreSoundUrl = (bundle: string, kind: CoreSoundKind): string =>
  getSoundUrl(bundle, kind)!;

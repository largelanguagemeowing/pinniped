import type { Settings } from '../state/settings';
import type { SoundKind } from './bundles';

export type SoundToggleGroup = 'Notifications' | 'App Events' | 'Calls';

export type SoundToggle = {
  kind: SoundKind;
  group: SoundToggleGroup;
  title: string;
  description: string;
};

/** Every sound the app plays, each with its own switch (Settings → Notifications). */
export const SOUND_TOGGLES: readonly SoundToggle[] = [
  {
    kind: 'message',
    group: 'Notifications',
    title: 'Message',
    description: 'A new message arrives.',
  },
  {
    kind: 'invite',
    group: 'Notifications',
    title: 'Invitation',
    description: 'You are invited to a room.',
  },
  {
    kind: 'call',
    group: 'Notifications',
    title: 'Incoming Call',
    description: 'Rings while someone calls you.',
  },

  {
    kind: 'sent',
    group: 'App Events',
    title: 'Message Sent',
    description: 'Your message was sent.',
  },
  { kind: 'signin', group: 'App Events', title: 'Sign In', description: 'The app starts.' },
  { kind: 'signout', group: 'App Events', title: 'Sign Out', description: 'You log out.' },
  {
    kind: 'online',
    group: 'App Events',
    title: 'Contact Online',
    description: 'A contact you have a DM with comes online.',
  },
  {
    kind: 'offline',
    group: 'App Events',
    title: 'Contact Offline',
    description: 'A contact you have a DM with goes offline.',
  },

  {
    kind: 'callStart',
    group: 'Calls',
    title: 'Call Started',
    description: 'You join a call, and the lead-in before an outgoing call rings.',
  },
  {
    kind: 'ringback',
    group: 'Calls',
    title: 'Outgoing Call Ringing',
    description: 'Plays while you wait for the other side to pick up.',
  },
  {
    kind: 'callJoin',
    group: 'Calls',
    title: 'Someone Joins',
    description: 'A participant joins your call.',
  },
  {
    kind: 'callLeave',
    group: 'Calls',
    title: 'Someone Leaves',
    description: 'A participant leaves your call, or you hang up.',
  },
  {
    kind: 'callDeclined',
    group: 'Calls',
    title: 'Call Declined',
    description: 'The other side declines your call.',
  },
  {
    kind: 'callTimeout',
    group: 'Calls',
    title: 'Call Not Answered',
    description: 'Your call times out.',
  },
  { kind: 'callEnd', group: 'Calls', title: 'Call Ended', description: 'You leave a call.' },
  {
    kind: 'raiseHand',
    group: 'Calls',
    title: 'Hand Raised',
    description: 'Someone in your call raises a hand.',
  },
  {
    kind: 'screenshareStarted',
    group: 'Calls',
    title: 'Screen Share Started',
    description: 'Someone in your call starts sharing their screen.',
  },
];

/** Before each sound had a switch, these shared the "Event Sounds" one. */
const LEGACY_EVENT_SOUNDS = new Set<SoundKind>([
  'sent',
  'signin',
  'signout',
  'online',
  'offline',
  'callEnd',
]);

export const isSoundEnabled = (
  settings: Pick<Settings, 'soundToggles' | 'eventSounds'>,
  kind: SoundKind
): boolean =>
  settings.soundToggles[kind] ?? (LEGACY_EVENT_SOUNDS.has(kind) ? settings.eventSounds : true);

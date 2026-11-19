import { getSettings, Settings } from '../state/settings';
import { EventSoundKind, getSoundUrl } from './bundles';
import { playEventSound } from './play';
import { isSoundEnabled } from './toggles';
import type { CallSoundCommand } from '../plugins/call/types';

/** The sound names the call widget asks for, as the kinds the bundles and toggles know them. */
const CALL_SOUND_KINDS: Record<string, EventSoundKind> = {
  join: 'callJoin',
  left: 'callLeave',
  decline: 'callDeclined',
  timeout: 'callTimeout',
  raiseHand: 'raiseHand',
  screenshareStarted: 'screenshareStarted',
  waiting: 'ringback',
  waitingIntro: 'callStart',
};

/** The kind for a sound name from the widget; names it does not use (`toString`...) have none. */
const callSoundKind = (sound: string): EventSoundKind | undefined =>
  Object.prototype.hasOwnProperty.call(CALL_SOUND_KINDS, sound)
    ? CALL_SOUND_KINDS[sound]
    : undefined;

const loopUrl = (kind: EventSoundKind, settings: Settings): string | undefined => {
  if (!settings.isNotificationSounds || !isSoundEnabled(settings, kind)) return undefined;
  return getSoundUrl(settings.notificationSoundBundle, kind);
};

/** Plays a call sound with the selected bundle, toggles and volume. */
export const playCallSound = (kind: EventSoundKind): void => {
  void playEventSound(kind);
};

/**
 * Repeats a call sound (after `intro`, if given) until the returned function is called; stopping
 * during the intro means the loop never starts.
 */
export const loopCallSound = (kind: EventSoundKind, intro?: EventSoundKind): (() => void) => {
  let stopped = false;
  let audio: HTMLAudioElement | undefined;
  const start = async () => {
    if (intro) await playEventSound(intro);
    if (stopped) return;
    const settings = getSettings();
    const url = loopUrl(kind, settings);
    if (!url) return;
    audio = new Audio(url);
    audio.loop = true;
    audio.volume = settings.soundVolume;
    audio.play().catch(() => undefined);
  };
  void start();
  return () => {
    stopped = true;
    audio?.pause();
  };
};

/** Loops the call widget started, by the id it gave them. */
const widgetLoops = new Map<number, () => void>();

/** Plays a sound the call widget asked for, with the selected bundle and toggles. */
export const handleCallSound = (command: CallSoundCommand): void => {
  switch (command.op) {
    case 'play': {
      const kind = callSoundKind(command.sound);
      if (kind) playCallSound(kind);
      return;
    }
    case 'loop': {
      const kind = callSoundKind(command.sound);
      const intro = command.intro !== undefined ? callSoundKind(command.intro) : undefined;
      if (kind) widgetLoops.set(command.id, loopCallSound(kind, intro));
      return;
    }
    case 'stop':
      widgetLoops.get(command.id)?.();
      widgetLoops.delete(command.id);
      return;
  }
};

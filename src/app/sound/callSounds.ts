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

/** Looping sounds that are playing, by the id the widget gave them. */
const loops = new Map<number, HTMLAudioElement>();
/** Loops stopped before they began (while their intro plays). */
const stopped = new Set<number>();

const loopUrl = (sound: string, settings: Settings): string | undefined => {
  const kind = callSoundKind(sound);
  if (!kind || !settings.isNotificationSounds || !isSoundEnabled(settings, kind)) return undefined;
  return getSoundUrl(settings.notificationSoundBundle, kind);
};

const startLoop = async (id: number, sound: string, intro?: string): Promise<void> => {
  const intro$ = intro !== undefined ? callSoundKind(intro) : undefined;
  if (intro$) await playEventSound(intro$);
  if (stopped.delete(id)) return;

  const settings = getSettings();
  const url = loopUrl(sound, settings);
  if (!url) return;
  const audio = new Audio(url);
  audio.loop = true;
  audio.volume = settings.soundVolume;
  loops.set(id, audio);
  audio.play().catch(() => undefined);
};

const stopLoop = (id: number): void => {
  const audio = loops.get(id);
  if (audio) {
    audio.pause();
    loops.delete(id);
  } else {
    stopped.add(id);
  }
};

/** Plays a sound the call widget asked for, with the selected bundle and toggles. */
export const handleCallSound = (command: CallSoundCommand): void => {
  switch (command.op) {
    case 'play': {
      const kind = callSoundKind(command.sound);
      if (kind) void playEventSound(kind);
      return;
    }
    case 'loop':
      void startLoop(command.id, command.sound, command.intro);
      return;
    case 'stop':
      stopLoop(command.id);
      return;
  }
};

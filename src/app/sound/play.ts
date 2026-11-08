import { getSettings } from '../state/settings';
import { logSound } from './log';
import { isSoundEnabled } from './toggles';
import { EventSoundKind, getSoundUrl } from './bundles';

// A sound that never ends (stalled load) must not hold up callers that await it, e.g. logout.
const MAX_WAIT_MS = 2000;

/** Plays the selected bundle's sound for an app event, if that sound is switched on. */
export const playEventSound = (kind: EventSoundKind): Promise<void> => {
  const settings = getSettings();
  const { isNotificationSounds, notificationSoundBundle, soundVolume } = settings;
  if (!isNotificationSounds || !isSoundEnabled(settings, kind)) {
    logSound('skip', kind, isNotificationSounds ? 'switched off' : 'notification sounds off');
    return Promise.resolve();
  }
  const url = getSoundUrl(notificationSoundBundle, kind);
  if (!url) {
    logSound('skip', kind, `bundle ${notificationSoundBundle} has none`);
    return Promise.resolve();
  }
  logSound('play', kind, `bundle ${notificationSoundBundle}`);

  const audio = new Audio(url);
  audio.volume = soundVolume;
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, MAX_WAIT_MS);
    audio.onended = () => {
      window.clearTimeout(timer);
      resolve();
    };
    audio.play().catch(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });
};

/** The end reasons (as the call reports them) and the sound each one plays after the call closes. */
const CALL_END_SOUNDS = {
  timeout: 'callTimeout',
  decline: 'callDeclined',
  user: 'callLeave',
} as const;

/**
 * Plays the end-of-call sound for a reason, after the call has closed: the call closes without
 * playing it, so the sound is not cut off.
 */
export const playCallEndSound = (reason: unknown): void => {
  if (typeof reason !== 'string' || !(reason in CALL_END_SOUNDS)) return;
  void playEventSound(CALL_END_SOUNDS[reason as keyof typeof CALL_END_SOUNDS]);
};

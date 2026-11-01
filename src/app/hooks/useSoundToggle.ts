import { useCallback } from 'react';
import { useAtom } from 'jotai';
import { SoundKind } from '../sound/bundles';
import { isSoundEnabled } from '../sound/toggles';
import { settingsAtom } from '../state/settings';

/** Whether a sound plays: notification sounds are on overall and its own switch is on. */
export const useSoundToggle = (kind: SoundKind): boolean => {
  const [settings] = useAtom(settingsAtom);
  return settings.isNotificationSounds && isSoundEnabled(settings, kind);
};

/** Sets one sound's switch. */
export const useSetSoundToggle = (): ((kind: SoundKind, enabled: boolean) => void) => {
  const [settings, setSettings] = useAtom(settingsAtom);
  return useCallback(
    (kind, enabled) =>
      setSettings({ ...settings, soundToggles: { ...settings.soundToggles, [kind]: enabled } }),
    [settings, setSettings]
  );
};

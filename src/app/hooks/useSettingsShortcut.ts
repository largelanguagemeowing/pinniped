import { useCallback } from 'react';
import { isKeyHotkey } from 'is-hotkey';
import { useAtom } from 'jotai';

import { settingsModalAtom } from '../state/settingsModal';
import { useKeyDown } from './useKeyDown';

/** Cmd+, (Ctrl+, elsewhere), the platform's key for settings, opens the settings or closes them. */
export const useSettingsShortcut = (): void => {
  const [settings, setSettings] = useAtom(settingsModalAtom);

  useKeyDown(
    window,
    useCallback(
      (event) => {
        if (!isKeyHotkey('mod+,', event)) return;
        event.preventDefault();
        setSettings(settings ? undefined : {});
      },
      [settings, setSettings]
    )
  );
};

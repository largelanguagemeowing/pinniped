import { useEffect, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { callEmbedAtom } from '../../state/callEmbed';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { bindingsToShortcuts, isCallHotkeyAction } from './hotkeys';

/**
 * Keeps the desktop's global shortcuts in step with the settings, and runs the call action when
 * one is pressed. Renders nothing. Outside the desktop app there is no bridge, so it does nothing.
 */
export function CallHotkeys() {
  const callEmbed = useAtomValue(callEmbedAtom);
  const [bindings] = useSetting(settingsAtom, 'callHotkeys');

  const shortcuts = useMemo(() => bindingsToShortcuts(bindings), [bindings]);
  const shortcutsKey = JSON.stringify(shortcuts);

  useEffect(() => {
    const bind = window.cinnyDesktop?.bindHotkeys;
    if (!bind || shortcuts.length === 0) return;
    bind(shortcuts).then((result) => {
      if (!result.ok) console.warn('Global shortcuts were not bound:', result.error);
    });
    // The serialized key stands in for the array so an equal list does not rebind.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcutsKey]);

  useEffect(() => {
    const onHotkey = window.cinnyDesktop?.onHotkey;
    if (!onHotkey) return undefined;
    return onHotkey((id) => {
      const control = callEmbed?.control;
      if (!control || !isCallHotkeyAction(id)) return;
      if (id === 'mute') control.toggleMicrophone();
      else control.toggleSound();
    });
  }, [callEmbed]);

  return null;
}

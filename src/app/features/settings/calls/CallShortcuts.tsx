import React, { useEffect, useState } from 'react';
import { Box, Button, Text } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { useSetting } from '../../../state/hooks/settings';
import { settingsAtom } from '../../../state/settings';
import { SequenceCardStyle } from '../styles.css';
import {
  bindingsToShortcuts,
  CALL_HOTKEY_ACTIONS,
  CallHotkeyAction,
  CallHotkeyBindings,
  shortcutFromKeyPress,
} from '../../call-hotkeys';

const isPlainEscape = (e: KeyboardEvent) =>
  e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;

/**
 * Call shortcuts for the Linux desktop app. Each action records a key combination; the desktop
 * asks the user to confirm it, since the portal never sets keys silently.
 */
export function CallShortcuts() {
  const [bindings, setBindings] = useSetting(settingsAtom, 'callHotkeys');
  const [recording, setRecording] = useState<CallHotkeyAction>();
  const [message, setMessage] = useState<string>();
  const bridge = window.pinnipedDesktop?.bindHotkeys;

  const apply = (next: CallHotkeyBindings) => {
    setBindings(next);
    if (!bridge) return;
    bridge(bindingsToShortcuts(next)).then((result) => {
      setMessage(
        result.ok
          ? 'Saved. If your desktop asks, confirm the key there.'
          : `Not bound: ${result.error ?? 'the desktop did not answer'}`
      );
    });
  };

  useEffect(() => {
    if (!recording) return undefined;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (isPlainEscape(event)) {
        setRecording(undefined);
        return;
      }
      const trigger = shortcutFromKeyPress(event);
      if (!trigger) {
        setMessage('Use a modifier such as Ctrl or Alt, or a function key.');
        return;
      }
      setRecording(undefined);
      apply({ ...bindings, [recording]: trigger });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // apply reads the current bindings, which is why they are a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, bindings]);

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Shortcuts</Text>
      <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
        {CALL_HOTKEY_ACTIONS.map(({ id, label }) => {
          const trigger = bindings[id];
          return (
            <SettingTile
              key={id}
              title={label}
              description={
                recording === id
                  ? 'Press the new key combination, or Escape to cancel.'
                  : (trigger ?? 'Not set')
              }
              after={
                <Box gap="200">
                  <Button
                    variant="Secondary"
                    fill="Soft"
                    size="300"
                    radii="300"
                    disabled={!bridge}
                    onClick={() => setRecording(id)}
                  >
                    <Text size="B300">{trigger ? 'Change' : 'Record'}</Text>
                  </Button>
                  {trigger && (
                    <Button
                      variant="Secondary"
                      fill="Soft"
                      size="300"
                      radii="300"
                      disabled={!bridge}
                      onClick={() => apply({ ...bindings, [id]: undefined })}
                    >
                      <Text size="B300">Clear</Text>
                    </Button>
                  )}
                </Box>
              }
            />
          );
        })}
      </SequenceCard>
      {!bridge && (
        <Text size="T200" priority="300">
          Global shortcuts need the Linux desktop app.
        </Text>
      )}
      {message && (
        <Text size="T200" priority="300">
          {message}
        </Text>
      )}
    </Box>
  );
}

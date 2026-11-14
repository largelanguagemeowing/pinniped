import React, { FormEventHandler, useState } from 'react';
import { Box, Button, Chip, Icon, Icons, Input, Switch, Text, config } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';
import { useSetting } from '../../../state/hooks/settings';
import { DEFAULT_SCREEN_SHARE_EXCLUDED, settingsAtom } from '../../../state/settings';
import { SequenceCardStyle } from '../styles.css';

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The programs whose audio a screen share never carries on Windows, however they are routed:
 * their sound is left out even when they play to the call's output device. Matched by
 * executable file name; the helper also leaves out anything such a program started.
 */
export function ScreenShareAudioExclusions() {
  const [excluded, setExcluded] = useSetting(settingsAtom, 'callScreenShareAudioExcluded');
  const [name, setName] = useState('');
  const [helperConsole, setHelperConsole] = useSetting(settingsAtom, 'helperConsole');

  const add: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const entry = name.trim();
    if (!entry) return;
    if (!excluded.some((existing) => sameName(existing, entry))) setExcluded([...excluded, entry]);
    setName('');
  };

  const isDefault =
    excluded.length === DEFAULT_SCREEN_SHARE_EXCLUDED.length &&
    DEFAULT_SCREEN_SHARE_EXCLUDED.every((entry) => excluded.some((e) => sameName(e, entry)));

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Screen Share Audio</Text>
      <SequenceCard
        className={SequenceCardStyle}
        variant="SurfaceVariant"
        direction="Column"
        gap="400"
      >
        <SettingTile
          title="Never Share These Programs"
          description="Their audio is left out of a screen share, whatever else plays and wherever it is routed. Use the executable file name, for example Discord.exe."
          after={
            <Button
              variant="Secondary"
              fill="Soft"
              size="300"
              radii="300"
              outlined
              disabled={isDefault}
              onClick={() => setExcluded([...DEFAULT_SCREEN_SHARE_EXCLUDED])}
            >
              <Text size="B300">Reset</Text>
            </Button>
          }
        >
          <Box direction="Column" gap="200" style={{ paddingTop: config.space.S200 }}>
            <Box gap="200" wrap="Wrap">
              {excluded.map((entry) => (
                <Chip
                  key={entry}
                  variant="Secondary"
                  radii="Pill"
                  after={<Icon size="50" src={Icons.Cross} />}
                  onClick={() => setExcluded(excluded.filter((e) => e !== entry))}
                  aria-label={`Remove ${entry}`}
                >
                  <Text size="T200">{entry}</Text>
                </Chip>
              ))}
              {excluded.length === 0 && (
                <Text size="T200" priority="300">
                  No programs are left out.
                </Text>
              )}
            </Box>
            <Box as="form" onSubmit={add} gap="200">
              <Box grow="Yes" direction="Column">
                <Input
                  value={name}
                  onChange={(evt) => setName(evt.currentTarget.value)}
                  placeholder="Program.exe"
                  variant="Secondary"
                  size="400"
                  radii="300"
                  aria-label="Program to leave out"
                />
              </Box>
              <Button
                type="submit"
                variant="Secondary"
                size="400"
                radii="300"
                disabled={!name.trim()}
              >
                <Text size="B400">Add</Text>
              </Button>
            </Box>
          </Box>
        </SettingTile>
        <SettingTile
          title="Helper Console"
          description="Opens the desktop helper in a console window with debug logging: what it shares and skips, and how steadily the audio goes out. Restarts the helper."
          after={<Switch variant="Primary" value={helperConsole} onChange={setHelperConsole} />}
        />
      </SequenceCard>
    </Box>
  );
}

import React from 'react';
import { Box, config, RadioButton } from 'folds';
import { SequenceCard } from '../sequence-card';
import { SettingTile } from '../setting-tile';
import { useCapabilities } from '../../hooks/useCapabilities';
import { DIRECT_ROOM_VERSIONS, DirectRoomVersion } from '../../utils/directRoom';

const OPTIONS: Record<DirectRoomVersion, { title: string; description: string }> = {
  '12': {
    title: 'Both of you are creators',
    description:
      'Room version 12, the current one. You both hold the highest power in the room, so either of you can still add a third person from another app (Pinniped starts a new group instead).',
  },
  '11': {
    title: 'Nobody can add people',
    description:
      'Room version 11, an older one, which is needed for invite protection. You both have the same power, and nobody can invite a third person to this chat from any app: the server refuses it.',
  },
};

type DirectRoomVersionSelectProps = {
  value: DirectRoomVersion;
  onChange: (value: DirectRoomVersion) => void;
  disabled?: boolean;
};

/** The choice of room version for a new one-to-one chat, with what each means. */
export function DirectRoomVersionSelect({
  value,
  onChange,
  disabled,
}: DirectRoomVersionSelectProps) {
  const available = useCapabilities()['m.room_versions']?.available;

  return (
    <SequenceCard
      style={{ padding: config.space.S300 }}
      variant="SurfaceVariant"
      direction="Column"
      gap="500"
    >
      <Box direction="Column" gap="500" role="radiogroup" aria-label="Room version">
        {DIRECT_ROOM_VERSIONS.map((version) => (
          <SettingTile
            key={version}
            title={OPTIONS[version].title}
            description={OPTIONS[version].description}
            after={
              <RadioButton
                variant="Primary"
                name="direct-room-version"
                aria-label={OPTIONS[version].title}
                checked={value === version}
                readOnly
                onClick={() => onChange(version)}
                // a server that does not list the version cannot make the room
                disabled={disabled || (available !== undefined && !(version in available))}
              />
            }
          />
        ))}
      </Box>
    </SequenceCard>
  );
}

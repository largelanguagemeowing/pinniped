import React, { useMemo, useState } from 'react';
import { Box, Switch, Text, color, config } from 'folds';
import { useAtomValue } from 'jotai';
import { Room } from 'matrix-js-sdk';
import { SequenceCard } from '../../components/sequence-card';
import { SettingTile } from '../../components/setting-tile';
import { SequenceCardStyle } from '../settings/styles.css';
import { allRoomsAtom } from '../../state/room-list/roomList';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import {
  setSoundPackGlobal,
  useGlobalSoundPacks,
  useRoomsSoundPacks,
} from '../../hooks/useSoundPacks';
import { getRoomName } from '../../utils/room';

/** Pick the rooms and spaces whose soundboards are playable in every call. */
export function GlobalSoundPacks() {
  const mx = useMatrixClient();
  const roomIds = useAtomValue(allRoomsAtom);
  const rooms = useMemo(
    () => roomIds.map((id) => mx.getRoom(id)).filter((r): r is Room => !!r),
    [mx, roomIds]
  );
  const packs = useRoomsSoundPacks(rooms);
  const globalPacks = useGlobalSoundPacks();
  const enabled = useMemo(() => new Set(globalPacks.map((pack) => pack.id)), [globalPacks]);
  const [error, setError] = useState<string>();

  const handleToggle = (roomId: string, value: boolean) => {
    setError(undefined);
    setSoundPackGlobal(mx, roomId, value).catch(() =>
      setError('Could not save the change. Please try again.')
    );
  };

  return (
    <Box direction="Column" gap="100">
      <Text size="L400">Favorite Soundboards</Text>
      {packs.length === 0 ? (
        <SequenceCard
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
          gap="400"
        >
          <SettingTile
            title="No Soundboards"
            description="Soundboards of your rooms and spaces appear here, to use in all your calls."
          />
        </SequenceCard>
      ) : (
        packs.map((pack) => {
          const room = mx.getRoom(pack.id);
          return (
            <SequenceCard
              key={pack.id}
              className={SequenceCardStyle}
              variant="SurfaceVariant"
              direction="Column"
              gap="400"
            >
              <SettingTile
                title={pack.name ?? (room ? getRoomName(room) : pack.id)}
                description={`${pack.sounds.length} ${
                  pack.sounds.length === 1 ? 'sound' : 'sounds'
                }${room && pack.name ? ` · ${getRoomName(room)}` : ''}`}
                after={
                  <Switch
                    variant="Primary"
                    value={enabled.has(pack.id)}
                    onChange={(value) => handleToggle(pack.id, value)}
                    aria-label="Use in all calls"
                  />
                }
              />
            </SequenceCard>
          );
        })
      )}
      {error && (
        <Text size="T200" style={{ color: color.Critical.Main, marginTop: config.space.S100 }}>
          {error}
        </Text>
      )}
    </Box>
  );
}

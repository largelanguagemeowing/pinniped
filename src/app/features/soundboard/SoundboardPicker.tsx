import React, { useMemo, useRef, useState } from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Box,
  Button,
  config,
  Icon,
  IconButton,
  Icons,
  Input,
  Line,
  Menu,
  PopOut,
  RectCords,
  Scroll,
  Text,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { Room } from 'matrix-js-sdk';
import { CallEmbed } from '../../plugins/call';
import { Sound, SoundPack } from '../../plugins/sound-pack';
import { useCallSoundPacks } from '../../hooks/useSoundPacks';
import { useSoundFavorites } from '../../state/soundFavorites';
import { useSetting } from '../../state/hooks/settings';
import { settingsAtom } from '../../state/settings';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { useMediaAuthentication } from '../../hooks/useMediaAuthentication';
import { mxcUrlToHttp } from '../../utils/matrix';
import { stopPropagation } from '../../utils/keyboard';
import { VolumeSlider } from '../../components/slider';
import * as css from './styles.css';
import { useSoundPlayer } from './useSoundPlayer';

type SoundTileProps = {
  sound: Sound;
  favorite: boolean;
  onPlay: (sound: Sound) => void;
  onToggleFavorite: (key: string) => void;
};
function SoundTile({ sound, favorite, onPlay, onToggleFavorite }: SoundTileProps) {
  return (
    <Box style={{ position: 'relative' }} className="soundboard-tile">
      <Button
        size="400"
        variant="Secondary"
        fill="Soft"
        radii="300"
        style={{ width: '100%', justifyContent: 'flex-start', paddingRight: 34 }}
        onClick={() => onPlay(sound)}
        title={sound.name}
      >
        <Box alignItems="Center" gap="200" style={{ minWidth: 0 }}>
          {sound.emoji && <Text size="T300">{sound.emoji}</Text>}
          <Text size="B300" truncate>
            {sound.name}
          </Text>
        </Box>
      </Button>
      <IconButton
        size="300"
        variant={favorite ? 'Primary' : 'Secondary'}
        fill="None"
        radii="300"
        aria-label={favorite ? 'Remove from favourites' : 'Add to favourites'}
        aria-pressed={favorite}
        onClick={() => onToggleFavorite(sound.key)}
        style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)' }}
      >
        <Icon size="100" src={Icons.Star} filled={favorite} />
      </IconButton>
    </Box>
  );
}

type Section = { id: string; title: string; sounds: Sound[] };

type RailItemProps = { label: string; onClick: () => void; children: React.ReactNode };
function RailItem({ label, onClick, children }: RailItemProps) {
  return (
    <IconButton
      size="400"
      variant="Background"
      fill="None"
      radii="300"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </IconButton>
  );
}

function PackAvatar({ pack, fallback }: { pack: SoundPack; fallback: string }) {
  const mx = useMatrixClient();
  const useAuthentication = useMediaAuthentication();
  const avatarUrl = pack.avatar ? mxcUrlToHttp(mx, pack.avatar, useAuthentication) : undefined;
  return (
    <Avatar size="300" radii="300">
      {avatarUrl ? (
        <AvatarImage src={avatarUrl} />
      ) : (
        <AvatarFallback>
          <Text size="T200">{(pack.name ?? fallback).charAt(0).toUpperCase()}</Text>
        </AvatarFallback>
      )}
    </Avatar>
  );
}

type SoundboardPickerProps = {
  callEmbed: CallEmbed;
  room: Room;
  anchor: RectCords | undefined;
  requestClose: () => void;
};
/** Pick a sound to play into the call: your own, favourites, recents and the room's packs. */
export function SoundboardPicker({ callEmbed, room, anchor, requestClose }: SoundboardPickerProps) {
  const { user, rooms } = useCallSoundPacks(room);
  const [favorites, toggleFavorite] = useSoundFavorites();
  const [recentKeys] = useSetting(settingsAtom, 'soundboardRecent');
  const [volume, setVolume] = useSetting(settingsAtom, 'soundboardVolume');
  const { play, stop } = useSoundPlayer(callEmbed);
  const [query, setQuery] = useState('');
  const [showVolume, setShowVolume] = useState(false);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  const packs = useMemo(() => [user, ...rooms], [user, rooms]);
  const all = useMemo(() => packs.flatMap((p) => p.sounds), [packs]);

  const sections = useMemo<Section[]>(() => {
    const needle = query.trim().toLowerCase();
    const matches = (s: Sound) => !needle || s.name.toLowerCase().includes(needle);
    const byKey = new Map(all.map((s) => [s.key, s]));
    const list: Section[] = [
      { id: 'favorites', title: 'Favourites', sounds: all.filter((s) => favorites.has(s.key)) },
      {
        id: 'recent',
        title: 'Recently Used',
        sounds: recentKeys.flatMap((k) => byKey.get(k) ?? []),
      },
      { id: user.id, title: 'My Sounds', sounds: user.sounds },
      ...rooms.map((p) => ({
        id: p.id,
        title: p.name ?? room.client.getRoom(p.id)?.name ?? 'Room Sounds',
        sounds: p.sounds,
      })),
    ];
    return list
      .map((s) => ({ ...s, sounds: s.sounds.filter(matches) }))
      .filter((s) => s.sounds.length > 0);
  }, [all, favorites, recentKeys, user, rooms, room.client, query]);

  const scrollTo = (id: string) =>
    sectionRefs.current.get(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });

  return (
    <PopOut
      anchor={anchor}
      position="Top"
      align="End"
      offset={8}
      content={
        <FocusTrap
          focusTrapOptions={{
            initialFocus: false,
            onDeactivate: requestClose,
            clickOutsideDeactivates: true,
            escapeDeactivates: stopPropagation,
          }}
        >
          <Menu
            style={{
              position: 'relative',
              width: 460,
              height: 400,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {showVolume && (
              <>
                {/* Closes the card on a click anywhere else in the picker. */}
                <Box
                  style={{ position: 'absolute', inset: 0, zIndex: 1 }}
                  onClick={() => setShowVolume(false)}
                />
                <Menu
                  style={{
                    position: 'absolute',
                    zIndex: 2,
                    top: 52,
                    right: 8,
                    width: 230,
                    padding: config.space.S300,
                  }}
                >
                  <Box direction="Column" gap="300">
                    <Text size="H6">Soundboard Volume</Text>
                    <VolumeSlider
                      aria-label="Soundboard volume"
                      value={volume}
                      onChange={setVolume}
                      className={css.FullWidth}
                    />
                  </Box>
                </Menu>
              </>
            )}
            <Box direction="Column" gap="200" style={{ padding: config.space.S200 }} shrink="No">
              <Box gap="200" alignItems="Center">
                <Box grow="Yes" style={{ minWidth: 0 }}>
                  <Input
                    style={{ width: '100%' }}
                    size="400"
                    variant="Background"
                    radii="300"
                    placeholder="Find the perfect sound"
                    value={query}
                    onChange={(evt) => setQuery(evt.currentTarget.value)}
                    before={<Icon size="100" src={Icons.Search} />}
                    autoFocus
                  />
                </Box>
                <IconButton
                  size="400"
                  variant="Background"
                  fill="None"
                  radii="300"
                  aria-label="Soundboard volume"
                  aria-pressed={showVolume}
                  onClick={() => setShowVolume(!showVolume)}
                >
                  <Icon src={volume === 0 ? Icons.VolumeMute : Icons.VolumeHigh} />
                </IconButton>
                <IconButton
                  size="400"
                  variant="Background"
                  fill="None"
                  radii="300"
                  aria-label="Stop sounds"
                  title="Stop sounds"
                  onClick={() => stop()}
                >
                  <Icon src={Icons.Pause} />
                </IconButton>
              </Box>
            </Box>
            <Line variant="Surface" size="300" />
            <Box grow="Yes" style={{ minHeight: 0 }}>
              <Box
                direction="Column"
                gap="100"
                shrink="No"
                style={{ width: 52, padding: config.space.S100, overflowY: 'auto' }}
              >
                <RailItem label="Favourites" onClick={() => scrollTo('favorites')}>
                  <Icon size="200" src={Icons.Star} />
                </RailItem>
                <RailItem label="Recently used" onClick={() => scrollTo('recent')}>
                  <Icon size="200" src={Icons.RecentClock} />
                </RailItem>
                {packs.map((p) => (
                  <RailItem
                    key={p.id}
                    label={p === user ? 'My sounds' : (p.name ?? 'Room sounds')}
                    onClick={() => scrollTo(p.id)}
                  >
                    <PackAvatar pack={p} fallback={p === user ? 'Me' : 'R'} />
                  </RailItem>
                ))}
              </Box>
              <Box grow="Yes" style={{ minWidth: 0 }}>
                <Scroll hideTrack visibility="Hover" style={{ flexGrow: 1 }}>
                  <Box
                    direction="Column"
                    gap="300"
                    style={{
                      padding: `${config.space.S100} ${config.space.S200} ${config.space.S200}`,
                    }}
                  >
                    {sections.length === 0 && (
                      <Text size="T300" priority="300" style={{ padding: config.space.S300 }}>
                        {all.length === 0
                          ? 'No sounds yet. Add some under Settings → Calls → Soundboard.'
                          : 'No sounds match.'}
                      </Text>
                    )}
                    {sections.map((section) => (
                      <Box
                        key={section.id}
                        direction="Column"
                        gap="100"
                        ref={(el: HTMLElement | null) => {
                          if (el) sectionRefs.current.set(section.id, el);
                          else sectionRefs.current.delete(section.id);
                        }}
                      >
                        <Text size="L400" priority="300">
                          {section.title}
                        </Text>
                        <Box
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                            gap: config.space.S100,
                          }}
                        >
                          {section.sounds.map((sound) => (
                            <SoundTile
                              key={sound.key}
                              sound={sound}
                              favorite={favorites.has(sound.key)}
                              onPlay={(s) => play(s).catch(() => undefined)}
                              onToggleFavorite={toggleFavorite}
                            />
                          ))}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Scroll>
              </Box>
            </Box>
          </Menu>
        </FocusTrap>
      }
    />
  );
}

import React, { FormEventHandler, useCallback, useRef, useState } from 'react';
import {
  Box,
  Button,
  config,
  Icon,
  IconButton,
  Icons,
  Input,
  Spinner,
  Switch,
  Text,
  color,
} from 'folds';
import { SequenceCard } from '../../components/sequence-card';
import { SettingTile } from '../../components/setting-tile';
import { SequenceCardStyle } from '../settings/styles.css';
import {
  readSoundFile,
  newSoundId,
  Sound,
  SoundMode,
  SoundPack,
  SoundPackContent,
  withoutSound,
  withSound,
  MAX_SOUND_BYTES,
  MAX_SOUND_MS,
} from '../../plugins/sound-pack';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { encryptFile } from '../../utils/matrix';
import { EmojiPickerButton } from './EmojiPickerButton';
import { useSoundBlobUrl } from './useSoundPlayer';

const formatDuration = (ms?: number) => (ms === undefined ? '' : `${(ms / 1000).toFixed(1)} s`);

type ModeSwitchProps = { value: SoundMode; onChange: (mode: SoundMode) => void };
/** Whether playing a sound again restarts it ('cut') or layers another copy ('add'). */
function ModeSwitch({ value, onChange }: ModeSwitchProps) {
  return (
    <Box
      direction="Column"
      gap="100"
      title="On: playing the sound again starts it over. Off: copies overlap."
    >
      <Text size="L400">Restart</Text>
      <Switch
        variant="Primary"
        value={value === 'cut'}
        onChange={(cut) => onChange(cut ? 'cut' : 'add')}
      />
    </Box>
  );
}

type SoundRowProps = {
  sound: Sound;
  canEdit: boolean;
  onSave: (id: string, name: string, emoji: string, mode: SoundMode) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
};
function SoundRow({ sound, canEdit, onSave, onDelete }: SoundRowProps) {
  const getBlobUrl = useSoundBlobUrl();
  const [editing, setEditing] = useState(false);
  const [emoji, setEmoji] = useState(sound.emoji);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<SoundMode>(sound.mode);
  const previews = useRef(new Set<HTMLAudioElement>());

  const preview = async () => {
    const audio = new Audio(await getBlobUrl(sound.url, sound.file));
    // Like in a call: 'cut' starts the sound over, 'add' plays another copy on top.
    if (sound.mode === 'cut') previews.current.forEach((a) => a.pause());
    previews.current.add(audio);
    audio.addEventListener('ended', () => previews.current.delete(audio));
    audio.play().catch(() => undefined);
  };

  const handleSave: FormEventHandler<HTMLFormElement> = async (evt) => {
    evt.preventDefault();
    const form = evt.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value.trim();
    if (!name) return;
    setBusy(true);
    setError(undefined);
    try {
      await onSave(sound.id, name, emoji ?? '', mode);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onDelete(sound.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  };

  const errorText = error && (
    <Text size="T200" style={{ color: color.Critical.Main, marginTop: config.space.S100 }}>
      {error}
    </Text>
  );

  if (editing) {
    return (
      <SettingTile>
        <Box as="form" onSubmit={handleSave} gap="200" alignItems="End">
          <Box direction="Column" gap="100">
            <Text size="L400">Emoji</Text>
            <EmojiPickerButton value={emoji} onChange={setEmoji} />
          </Box>
          <Box direction="Column" gap="100" grow="Yes">
            <Text size="L400">Name</Text>
            <Input
              name="name"
              size="400"
              variant="Secondary"
              radii="300"
              defaultValue={sound.name}
              required
            />
          </Box>
          <ModeSwitch value={mode} onChange={setMode} />
          <Button type="submit" size="400" variant="Primary" radii="300" disabled={busy}>
            <Text size="B400">Save</Text>
          </Button>
          <Button
            type="button"
            size="400"
            variant="Secondary"
            fill="Soft"
            radii="300"
            onClick={() => {
              setEmoji(sound.emoji);
              setMode(sound.mode);
              setEditing(false);
            }}
          >
            <Text size="B400">Cancel</Text>
          </Button>
        </Box>
        {errorText}
      </SettingTile>
    );
  }

  return (
    <SettingTile
      title={`${sound.emoji ? `${sound.emoji} ` : ''}${sound.name}`}
      description={`${formatDuration(sound.duration)}${
        sound.mode === 'cut'
          ? `${sound.duration === undefined ? '' : ' · '}Restarts when repeated`
          : ''
      }`}
      after={
        <Box gap="100" alignItems="Center">
          <IconButton
            size="300"
            variant="Secondary"
            fill="None"
            radii="300"
            aria-label="Preview"
            onClick={() => preview().catch(() => undefined)}
          >
            <Icon size="100" src={Icons.Play} />
          </IconButton>
          {canEdit && (
            <>
              <IconButton
                size="300"
                variant="Secondary"
                fill="None"
                radii="300"
                aria-label="Rename"
                onClick={() => setEditing(true)}
              >
                <Icon size="100" src={Icons.Pencil} />
              </IconButton>
              <IconButton
                size="300"
                variant="Critical"
                fill="None"
                radii="300"
                aria-label="Delete"
                disabled={busy}
                onClick={handleDelete}
              >
                <Icon size="100" src={Icons.Delete} />
              </IconButton>
            </>
          )}
        </Box>
      }
    >
      {errorText}
    </SettingTile>
  );
}

type SoundPackEditorProps = {
  pack: SoundPack;
  canEdit: boolean;
  /** Replaces the pack's stored content. */
  onUpdate: (content: SoundPackContent) => Promise<unknown>;
};
/** Lists a sound pack and, if editable, uploads, renames and deletes its sounds. */
export function SoundPackEditor({ pack, canEdit, onUpdate }: SoundPackEditorProps) {
  const mx = useMatrixClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [newEmoji, setNewEmoji] = useState<string>();
  const [newMode, setNewMode] = useState<SoundMode>('add');
  const pendingPreview = useRef<HTMLAudioElement>(undefined);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();

  // Changes are applied to the newest content when they run, one after another,
  // so an edit made during a slow upload (or a quick second edit) is not lost.
  const latest = useRef(pack.content);
  latest.current = pack.content;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const change = useCallback(
    (apply: (content: SoundPackContent) => SoundPackContent) => {
      const run = queue.current
        .catch(() => undefined)
        .then(() => {
          const next = apply(latest.current);
          latest.current = next;
          return onUpdate(next);
        });
      queue.current = run;
      return run;
    },
    [onUpdate]
  );

  const handleUpload: FormEventHandler<HTMLFormElement> = async (evt) => {
    evt.preventDefault();
    const form = evt.currentTarget;
    if (!file || uploading) return;
    const name =
      (form.elements.namedItem('name') as HTMLInputElement).value.trim() ||
      file.name.replace(/\.[^.]+$/, '');

    setUploading(true);
    setError(undefined);
    try {
      const { duration } = await readSoundFile(file);
      // Room packs are state events visible to the room; in an encrypted room
      // the audio must be encrypted like any other attachment.
      const encrypt = !!pack.address && mx.isRoomEncrypted(pack.address.roomId);
      const encrypted = encrypt ? await encryptFile(file) : undefined;
      const { content_uri: url } = await mx.uploadContent(encrypted?.file ?? file, {
        name: file.name,
        type: encrypted ? 'application/octet-stream' : file.type,
      });
      await change((content) => {
        const id = newSoundId(name, (taken) => !!content.sounds?.[taken]);
        return withSound(content, id, {
          url,
          name,
          emoji: newEmoji,
          mode: newMode === 'cut' ? 'cut' : undefined,
          info: { mimetype: file.type, size: file.size, duration },
          file: encrypted?.encInfo,
        });
      });
      form.reset();
      setFile(undefined);
      setNewEmoji(undefined);
      setNewMode('add');
      pendingPreview.current?.pause();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  // Listen to the chosen file before uploading it.
  const previewPending = () => {
    if (!file) return;
    pendingPreview.current?.pause();
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.addEventListener('ended', () => URL.revokeObjectURL(url));
    pendingPreview.current = audio;
    audio.play().catch(() => undefined);
  };

  const handleSave = (id: string, name: string, emoji: string, mode: SoundMode) => {
    if (!pack.content.sounds?.[id]) return Promise.resolve();
    return change((content) => {
      const current = content.sounds?.[id];
      return current
        ? withSound(content, id, {
            ...current,
            name,
            emoji: emoji || undefined,
            mode: mode === 'cut' ? 'cut' : undefined,
          })
        : content;
    });
  };

  return (
    <Box direction="Column" gap="100">
      {pack.sounds.length === 0 && (
        <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
          <SettingTile title="No sounds yet" description="Upload a short clip below." />
        </SequenceCard>
      )}
      {pack.sounds.map((sound) => (
        <SequenceCard
          key={sound.key}
          className={SequenceCardStyle}
          variant="SurfaceVariant"
          direction="Column"
        >
          <SoundRow
            sound={sound}
            canEdit={canEdit}
            onSave={handleSave}
            onDelete={(id) => change((content) => withoutSound(content, id))}
          />
        </SequenceCard>
      ))}
      {canEdit && (
        <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
          <SettingTile
            title="Add Sound"
            description={`An audio clip up to ${MAX_SOUND_MS / 1000} seconds and ${
              MAX_SOUND_BYTES / 1024 / 1024
            } MB.`}
          >
            <Box
              as="form"
              onSubmit={handleUpload}
              gap="200"
              alignItems="End"
              style={{ marginTop: config.space.S200 }}
            >
              <Box direction="Column" gap="100">
                <Text size="L400">Emoji</Text>
                <EmojiPickerButton value={newEmoji} onChange={setNewEmoji} />
              </Box>
              <Box direction="Column" gap="100" grow="Yes">
                <Text size="L400">Name</Text>
                <Input
                  name="name"
                  size="400"
                  variant="Secondary"
                  radii="300"
                  placeholder={file ? file.name.replace(/\.[^.]+$/, '') : undefined}
                />
              </Box>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*"
                hidden
                onChange={(evt) => setFile(evt.currentTarget.files?.[0])}
              />
              <Button
                type="button"
                size="400"
                variant="Secondary"
                fill="Soft"
                radii="300"
                outlined
                onClick={() => fileRef.current?.click()}
                style={{ maxWidth: 160 }}
              >
                <Text size="B400" truncate>
                  {file ? file.name : 'Choose File'}
                </Text>
              </Button>
              <IconButton
                type="button"
                size="400"
                variant="Secondary"
                fill="Soft"
                radii="300"
                aria-label="Preview chosen file"
                title="Preview"
                disabled={!file}
                onClick={previewPending}
              >
                <Icon size="100" src={Icons.Play} />
              </IconButton>
              <ModeSwitch value={newMode} onChange={setNewMode} />
              <Button
                type="submit"
                size="400"
                variant="Primary"
                radii="300"
                disabled={!file || uploading}
                before={
                  uploading ? <Spinner size="100" variant="Primary" fill="Solid" /> : undefined
                }
              >
                <Text size="B400">Add</Text>
              </Button>
            </Box>
            {error && (
              <Text
                size="T200"
                style={{ color: color.Critical.Main, marginTop: config.space.S100 }}
              >
                {error}
              </Text>
            )}
          </SettingTile>
        </SequenceCard>
      )}
    </Box>
  );
}

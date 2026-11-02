import { PackSound, SoundMode, SoundPackContent } from './types';

export type Sound = {
  /** Unique across packs: `<packId>/<soundId>`. */
  key: string;
  packId: string;
  id: string;
  url: string;
  /** Decryption info when the file is stored encrypted. */
  file?: PackSound['file'];
  name: string;
  emoji?: string;
  mode: SoundMode;
  /** Milliseconds, when known. */
  duration?: number;
};

export type SoundPackAddress = { roomId: string };

const parseSound = (packId: string, id: string, sound: PackSound): Sound | undefined => {
  if (typeof sound?.url !== 'string' || !sound.url.startsWith('mxc://')) return undefined;
  return {
    key: `${packId}/${id}`,
    packId,
    id,
    url: sound.url,
    file: sound.file && typeof sound.file === 'object' ? sound.file : undefined,
    name: typeof sound.name === 'string' && sound.name ? sound.name : id,
    emoji: typeof sound.emoji === 'string' && sound.emoji ? sound.emoji : undefined,
    mode: sound.mode === 'cut' ? 'cut' : 'add',
    duration: typeof sound.info?.duration === 'number' ? sound.info.duration : undefined,
  };
};

export class SoundPack {
  public readonly sounds: Sound[];

  constructor(
    public readonly id: string,
    public readonly content: SoundPackContent,
    /** Set for room and space packs. */
    public readonly address?: SoundPackAddress
  ) {
    this.sounds = Object.entries(content.sounds ?? {})
      .map(([soundId, sound]) => parseSound(id, soundId, sound))
      .filter((s): s is Sound => s !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get name(): string | undefined {
    const { display_name: name } = this.content.pack ?? {};
    return typeof name === 'string' && name ? name : undefined;
  }

  get avatar(): string | undefined {
    const { avatar_url: avatar } = this.content.pack ?? {};
    return typeof avatar === 'string' ? avatar : undefined;
  }
}

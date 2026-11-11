import { describe, expect, it } from 'vitest';
import { mapDiscordActivity, UNNAMED_ACTIVITY } from '../../src/app/utils/discordActivity';

describe('mapping an RPC activity to rich presence', () => {
  it('maps a listening activity to media, with the playback window as progress', () => {
    const { payload, coverUrl } = mapDiscordActivity({
      type: 2,
      name: 'Music Player',
      details: 'Track',
      state: 'Artist',
      timestamps: { start: 1_700_000_000, end: 1_700_000_180 },
      assets: { large_image: 'https://example.org/cover.jpg', large_text: 'Album' },
    });
    expect(payload).toEqual({
      type: 'com.ip-logger.msc4320.rpc.media',
      artist: 'Artist',
      track: 'Track',
      album: 'Album',
      progress: { length: 180, time_complete: 1_700_000_180_000 },
      player: 'Music Player',
    });
    expect(coverUrl).toBe('https://example.org/cover.jpg');
  });

  it('names an activity after what the client reported, without repeating it', () => {
    expect(mapDiscordActivity({ name: 'Game', details: 'Level 3', state: 'Solo' }).payload).toEqual(
      { type: 'com.ip-logger.msc4320.rpc.activity', name: 'Game', details: 'Level 3 · Solo' }
    );
    expect(mapDiscordActivity({ details: 'Level 3', state: 'Solo' }).payload).toEqual({
      type: 'com.ip-logger.msc4320.rpc.activity',
      name: 'Level 3',
      details: 'Solo',
    });
    expect(mapDiscordActivity({ state: 'In menu' }).payload).toEqual({
      type: 'com.ip-logger.msc4320.rpc.activity',
      name: 'In menu',
      details: undefined,
    });
  });

  it('publishes a neutral name when the client reported no text', () => {
    const { payload } = mapDiscordActivity({ assets: { large_image: 'logo' } });
    expect(payload).toEqual({
      type: 'com.ip-logger.msc4320.rpc.activity',
      name: UNNAMED_ACTIVITY,
      details: undefined,
    });
  });

  it('only resolves covers from http(s) URLs, not asset keys', () => {
    expect(mapDiscordActivity({ name: 'Game', assets: { large_image: 'logo' } }).coverUrl).toBe(
      undefined
    );
  });
});

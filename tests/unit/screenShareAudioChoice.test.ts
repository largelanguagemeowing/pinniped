import { describe, expect, it } from 'vitest';

import {
  shareAudioKey,
  shareAudioOptions,
} from '../../src/app/features/call/screenShareAudioChoice';

const firefox = { id: 'firefox', name: 'Firefox' };
const spotify = { id: 'spotify', name: 'Spotify' };

describe('the screen share audio choices', () => {
  it('offer no audio, every application, and each application playing now', () => {
    const options = shareAudioOptions([firefox, spotify], { kind: 'all' });
    expect(options.map((o) => o.choice)).toEqual([
      { kind: 'off' },
      { kind: 'all' },
      { kind: 'app', app: firefox },
      { kind: 'app', app: spotify },
    ]);
  });

  it('keep the chosen application when it stops playing, so the choice still shows', () => {
    const chosen = { kind: 'app', app: spotify } as const;
    const options = shareAudioOptions([firefox], chosen);
    expect(options.map((o) => o.value)).toContain(shareAudioKey(chosen));
  });

  it('tell applications apart by id, not by name', () => {
    const twin = { id: 'firefox-esr', name: 'Firefox' };
    const values = shareAudioOptions([firefox, twin], { kind: 'all' }).map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

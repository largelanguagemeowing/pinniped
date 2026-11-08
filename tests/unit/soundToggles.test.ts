import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../../src/app/state/settings';

const stored = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => stored.set(key, value),
  removeItem: (key: string) => stored.delete(key),
});
vi.stubGlobal('window', { location: { href: 'app://cinny/' } });

let toggles: typeof import('../../src/app/sound/toggles');
let play: typeof import('../../src/app/sound/play');

beforeAll(async () => {
  toggles = await import('../../src/app/sound/toggles');
  play = await import('../../src/app/sound/play');
});

const settings = (over: Partial<Settings> = {}) =>
  ({
    isNotificationSounds: true,
    eventSounds: false,
    soundToggles: {},
    notificationSoundBundle: 'skype',
    ...over,
  }) as Settings;

describe('isSoundEnabled', () => {
  it('keeps the old defaults: event sounds follow the legacy switch, the rest are on', () => {
    expect(toggles.isSoundEnabled(settings(), 'message')).toBe(true);
    expect(toggles.isSoundEnabled(settings(), 'callJoin')).toBe(true);
    expect(toggles.isSoundEnabled(settings(), 'callStart')).toBe(true);
    expect(toggles.isSoundEnabled(settings(), 'sent')).toBe(false);
    expect(toggles.isSoundEnabled(settings({ eventSounds: true }), 'sent')).toBe(true);
  });

  it('lets a sound override its default either way', () => {
    expect(toggles.isSoundEnabled(settings({ soundToggles: { message: false } }), 'message')).toBe(
      false
    );
    expect(toggles.isSoundEnabled(settings({ soundToggles: { sent: true } }), 'sent')).toBe(true);
  });

  it('lists every sound once', () => {
    const kinds = toggles.SOUND_TOGGLES.map((t) => t.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

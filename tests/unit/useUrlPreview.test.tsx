import React from 'react';
import { act, create } from 'react-test-renderer';
import { Provider, createStore } from 'jotai';
import type { Room } from 'matrix-js-sdk';
import { describe, expect, it, vi } from 'vitest';
import { getSettings, settingsAtom, Settings } from '../../src/app/state/settings';
import { useUrlPreviewSetting } from '../../src/app/hooks/useUrlPreview';

// settings.ts keeps the settings in localStorage; Vitest runs in plain Node.
vi.hoisted(() => {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  } as Storage;
});

const room = (encrypted: boolean) => ({ hasEncryptionStateEvent: () => encrypted }) as Room;

const previewFor = (settings: Partial<Settings>) => {
  // Setting the atom saves to storage; start each case from the defaults.
  localStorage.clear();
  const store = createStore();
  store.set(settingsAtom, { ...getSettings(), ...settings });
  let read!: (r: Room) => boolean;
  function Probe() {
    read = useUrlPreviewSetting();
    return null;
  }
  act(() => {
    create(
      <Provider store={store}>
        <Probe />
      </Provider>
    );
  });
  return read;
};

describe('useUrlPreviewSetting', () => {
  it('uses the encrypted room setting in encrypted rooms and the other one elsewhere', () => {
    const onlyPlain = previewFor({ urlPreview: true, encUrlPreview: false });
    expect(onlyPlain(room(false))).toBe(true);
    expect(onlyPlain(room(true))).toBe(false);

    const onlyEncrypted = previewFor({ urlPreview: false, encUrlPreview: true });
    expect(onlyEncrypted(room(false))).toBe(false);
    expect(onlyEncrypted(room(true))).toBe(true);
  });

  it('is off in encrypted rooms by default', () => {
    expect(previewFor({})(room(true))).toBe(false);
  });
});

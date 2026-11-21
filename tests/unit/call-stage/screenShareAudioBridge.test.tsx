// @vitest-environment jsdom
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createStore, Provider } from 'jotai';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Call } from '../../../src/app/plugins/call/Call';
import { useScreenShareAudioBridge } from '../../../src/app/hooks/useActiveCall';
import { screenShareAudioScopeAtom } from '../../../src/app/state/screenShareAudioScope';
import { type Settings, settingsAtom } from '../../../src/app/state/settings';

// The desktop app's bridge to its helper, recording the commands the call sends.
let commands: string[] = [];
const bridge = {
  setConsole: (enabled: boolean) => commands.push(`console ${enabled}`),
  prepare: async () => {
    commands.push('prepare');
    return { ok: true };
  },
  release: async () => {
    commands.push('release');
  },
  link: async (active: boolean, _output?: string, _exclude?: string[], only?: string) => {
    commands.push(only === undefined ? `link ${active}` : `link ${active} only ${only}`);
  },
};
Object.defineProperty(window, 'pinnipedDesktop', {
  value: { screenShareAudio: bridge },
  configurable: true,
});
Object.defineProperty(navigator, 'mediaDevices', {
  value: Object.assign(new EventTarget(), { enumerateDevices: async () => [] }),
  configurable: true,
});

const sharing$ = new BehaviorSubject(false);
const call = { vm: { sharingScreen$: sharing$ } } as unknown as Call;

function ActiveCall() {
  useScreenShareAudioBridge(call);
  return null;
}

let store: ReturnType<typeof createStore>;
let renderer: ReactTestRenderer | undefined;
const set = (change: Partial<Settings>) =>
  act(() => store.set(settingsAtom, { ...store.get(settingsAtom), ...change }));
const startCall = () =>
  act(() => {
    renderer = create(
      <Provider store={store}>
        <ActiveCall />
      </Provider>
    );
  });
const endCall = () =>
  act(() => {
    renderer?.unmount();
    renderer = undefined;
  });

beforeEach(() => {
  commands = [];
  store = createStore();
  set({ callScreenShareAudio: true, helperConsole: false });
});
afterEach(() => {
  endCall();
  sharing$.next(false);
});

describe('the screen share audio device', () => {
  it('is not made for a call without share audio', () => {
    set({ callScreenShareAudio: false });
    startCall();
    set({ helperConsole: true });
    endCall();
    expect(commands).toEqual([]);
  });

  it('is made when the call starts with share audio on, the console option first', () => {
    startCall();
    expect(commands.slice(0, 2)).toEqual(['console false', 'prepare']);
  });

  it('is made once share audio is turned on, and stays until the call ends', () => {
    set({ callScreenShareAudio: false });
    startCall();
    set({ callScreenShareAudio: true });
    expect(commands.filter((c) => c === 'prepare')).toHaveLength(1);
    set({ callScreenShareAudio: false });
    expect(commands).not.toContain('release');
    endCall();
    expect(commands.filter((c) => c === 'release')).toHaveLength(1);
  });

  it('is asked for again when the console option restarts the helper', () => {
    startCall();
    commands = [];
    set({ helperConsole: true });
    expect(commands.filter((c) => !c.startsWith('link'))).toEqual(['console true', 'prepare']);
  });
});

describe('a screen share limited to one application', () => {
  const spotify = { id: 'spotify.exe', name: 'Spotify' };

  it('links only that application while the share runs', () => {
    startCall();
    act(() => store.set(screenShareAudioScopeAtom, { kind: 'app', app: spotify }));
    commands = [];
    act(() => sharing$.next(true));
    expect(commands).toContain('link true only spotify.exe');
    expect(commands).not.toContain('link true');
  });

  it('is limited for that share only: the next one carries every application', () => {
    startCall();
    act(() => store.set(screenShareAudioScopeAtom, { kind: 'app', app: spotify }));
    act(() => sharing$.next(true));
    act(() => sharing$.next(false));
    expect(store.get(screenShareAudioScopeAtom)).toEqual({ kind: 'all' });

    commands = [];
    act(() => sharing$.next(true));
    expect(commands).toContain('link true');
    expect(commands.some((c) => c.includes('only'))).toBe(false);
  });
});

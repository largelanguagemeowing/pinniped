// @vitest-environment jsdom
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createStore, Provider } from 'jotai';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Call } from '../../../src/app/plugins/call/Call';
import { useScreenShareAudioBridge } from '../../../src/app/hooks/useActiveCall';
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
  link: async (active: boolean) => {
    commands.push(`link ${active}`);
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

const call = { vm: { sharingScreen$: new BehaviorSubject(false) } } as unknown as Call;

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
afterEach(() => endCall());

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

import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it } from 'vitest';
import { AppStoreProvider } from '../../../src/app/state/appStore';
import { useSetting } from '../../../src/app/state/hooks/settings';
import { Settings, settingsAtom } from '../../../src/app/state/settings';
import { callSettings, selectCallDevice } from '../../../src/app/plugins/call/engine/settings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Setters = { [K in keyof Settings]?: (value: Settings[K]) => void };
const setters: Setters = {};
let shown: Partial<Settings> = {};

/** A settings page: writes and reads settings the way the app's UI does. */
function SettingsUi() {
  const [voiceGate, setVoiceGate] = useSetting(settingsAtom, 'callVoiceGate');
  const [, setThreshold] = useSetting(settingsAtom, 'callVoiceGateThreshold');
  const [, setAutoGain] = useSetting(settingsAtom, 'callAutoGain');
  const [userVolumes, setUserVolumes] = useSetting(settingsAtom, 'callUserVolumes');
  const [soundboardVolume, setSoundboardVolume] = useSetting(settingsAtom, 'soundboardVolume');
  const [audioOutput] = useSetting(settingsAtom, 'callAudioOutput');
  Object.assign(setters, {
    callVoiceGate: setVoiceGate,
    callVoiceGateThreshold: setThreshold,
    callAutoGain: setAutoGain,
    callUserVolumes: setUserVolumes,
    soundboardVolume: setSoundboardVolume,
  });
  shown = {
    callVoiceGate: voiceGate,
    callUserVolumes: userVolumes,
    soundboardVolume,
    callAudioOutput: audioOutput,
  };
  return null;
}

const mount = async () => {
  await act(async () => {
    create(
      <AppStoreProvider>
        <SettingsUi />
      </AppStoreProvider>
    );
  });
};

it('applies settings changed in the app to the call', async () => {
  await mount();
  await act(async () => {
    setters.callVoiceGate?.(!callSettings.voiceGate$.value);
    setters.callVoiceGateThreshold?.(0.2);
    setters.callAutoGain?.(!callSettings.autoGain$.value);
    setters.callUserVolumes?.({ '@bob:example.org': 1.7 });
    setters.soundboardVolume?.(0.25);
  });

  expect(callSettings.voiceGate$.value).toBe(shown.callVoiceGate);
  expect(callSettings.voiceGateThreshold$.value).toBe(0.2);
  expect(callSettings.userVolumes$.value['@bob:example.org']).toBe(1.7);
  expect(callSettings.soundboardVolume$.value).toBe(0.25);
});

it('keeps settings the app changed when the call chooses a device', async () => {
  await mount();
  await act(async () => {
    setters.soundboardVolume?.(0.4);
    setters.callUserVolumes?.({ '@carol:example.org': 0.5 });
  });
  await act(async () => {
    selectCallDevice('callAudioOutput', 'headset');
  });

  expect(shown.callAudioOutput).toBe('headset');
  expect(shown.soundboardVolume).toBe(0.4);
  expect(shown.callUserVolumes).toEqual({ '@carol:example.org': 0.5 });
});

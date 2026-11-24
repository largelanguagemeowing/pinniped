import { BehaviorSubject, distinctUntilChanged, map, Observable } from 'rxjs';

import { appStore as store } from '../../../state/appStore';
import { type Settings, settingsAtom } from '../../../state/settings';
import { getCallUserVolumes, type ScreenShareQuality } from '../types';
import { normalizeVoiceTuning, type VoiceTuning } from '../voiceTuning';
import { type Behavior } from './state/Behavior';
import { type ScreenShareAudioSource, screenShareAudioSource } from './livekit/screenShareAudio';

const settings$ = new Observable<Settings>((subscriber) => {
  subscriber.next(store.get(settingsAtom));
  return store.sub(settingsAtom, () => subscriber.next(store.get(settingsAtom)));
});

/** Settings are rewritten whole on every change; compare the values, not the objects. */
const sameValue = <T>(a: T, b: T): boolean => JSON.stringify(a) === JSON.stringify(b);

/** One call setting, read from Pinniped's settings; emits only when its own value changes. */
function setting<T>(select: (settings: Settings) => T): Behavior<T> {
  const value$ = new BehaviorSubject(select(store.get(settingsAtom)));
  settings$.pipe(map(select), distinctUntilChanged(sameValue)).subscribe(value$);
  return value$;
}

/** An empty device id is the system default. */
const deviceId = (id: string): string | undefined => (id === '' ? undefined : id);

/** The settings the call reads while it runs; changing one in Pinniped applies it mid-call. */
export const callSettings = {
  autoGain$: setting((s) => s.callAutoGain),
  echoCancellation$: setting((s) => s.callEchoCancellation),
  monoMic$: setting((s) => s.callMonoMic),
  voiceGate$: setting((s) => s.callVoiceGate),
  voiceGateAuto$: setting((s) => s.callVoiceGateAuto),
  /** 0-1: how loud speech must be to open the gate when not automatic. */
  voiceGateThreshold$: setting((s) => s.callVoiceGateThreshold),
  voiceTuning$: setting<VoiceTuning>((s) => normalizeVoiceTuning(s.callVoiceTuning)),
  simulcast$: setting((s) => s.callSimulcast),
  screenShareQuality$: setting<ScreenShareQuality>((s) => s.callScreenShare),
  screenShareContent$: setting((s) => s.callScreenShareContent),
  screenShareAudio$: setting<ScreenShareAudioSource>((s) =>
    screenShareAudioSource(s.callScreenShareAudio)
  ),
  /** Volume of the call's own sounds, 0-1. */
  soundVolume$: setting((s) => s.soundVolume),
  /** How loud soundboard sounds are for this client, 0-1. */
  soundboardVolume$: setting((s) => s.soundboardVolume),
  /** Voice level per participant (Matrix user ID), 0 when muted; absent means 1. */
  userVolumes$: setting((s) => getCallUserVolumes(s)),
  /** Participants whose soundboard sounds this client does not hear. */
  mutedSoundboards$: setting((s) => s.callSoundboardMutedUsers),
  audioInput$: setting((s) => deviceId(s.callAudioInput)),
  audioOutput$: setting((s) => deviceId(s.callAudioOutput)),
};

/** Chooses the microphone or speaker in Pinniped's settings; undefined is the system default. */
export function selectCallDevice(
  kind: 'callAudioInput' | 'callAudioOutput',
  id: string | undefined
): void {
  store.set(settingsAtom, { ...store.get(settingsAtom), [kind]: id ?? '' });
}

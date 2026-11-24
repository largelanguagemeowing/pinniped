/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Observable, combineLatest, distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { callSettings } from '../settings';
import { type BroadcastTrack } from './broadcastTracks';
import { processingAudioContext } from './processingAudioContext';
import { VoiceGate } from './voiceGateLogic';

/** RMS level (0..1) of the audio an analyser currently sees. */
export function measureLevel(analyser: AnalyserNode, samples: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}

const POLL_MS = 40;

// Browsers cap the number of AudioContexts, so every meter shares one.
let sharedContext: AudioContext | undefined;
const context = (): AudioContext | undefined => {
  if (typeof AudioContext === 'undefined') return undefined;
  sharedContext ??= processingAudioContext();
  if (sharedContext.state === 'suspended') sharedContext.resume().catch(() => {});
  return sharedContext;
};

/**
 * On a track this client sends, anything above digital silence is being
 * broadcast (the voice gate leaves exact silence while closed), so this is the
 * level that counts.
 */
const SENT_OPEN_LEVEL = 10 ** (-75 / 20);
const SENT_CLOSE_LEVEL = 10 ** (-80 / 20);

/**
 * Emits whether the track carries sound: any audio above digital silence counts, for every
 * participant, so the ring shows whenever someone is sending anything.
 */
function observeTrackVoice$({ track }: BroadcastTrack): Observable<boolean> {
  return new Observable<boolean>((subscriber) => {
    const ctx = context();
    if (ctx === undefined) {
      subscriber.next(false);
      return undefined;
    }
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser); // not to the destination: this only measures
    const samples = new Float32Array(analyser.fftSize);
    const gate = new VoiceGate();
    subscriber.next(false);
    const id = setInterval(() => {
      const tuning = callSettings.voiceTuning$.value;
      gate.setLevels(SENT_OPEN_LEVEL, SENT_CLOSE_LEVEL);
      gate.holdMs = tuning.indicatorHoldMs;
      subscriber.next(gate.update(measureLevel(analyser, samples), Date.now()));
    }, POLL_MS);
    return (): void => {
      clearInterval(id);
      source.disconnect();
      analyser.disconnect();
    };
  });
}

/**
 * Measures speech from the audio itself, as it is sent or received, rather than
 * waiting for the server's speaker updates, which are coarse and delayed.
 * True while any of the tracks carries speech (or, on a track we send, anything
 * at all); false until there is a track.
 */
export function observeVoiceActivity$(tracks$: Observable<BroadcastTrack[]>): Observable<boolean> {
  return tracks$.pipe(
    switchMap((tracks) =>
      tracks.length === 0
        ? of(false)
        : combineLatest(tracks.map(observeTrackVoice$)).pipe(map((voices) => voices.some(Boolean)))
    ),
    distinctUntilChanged()
  );
}

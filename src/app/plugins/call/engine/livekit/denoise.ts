/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type LocalAudioTrack } from 'livekit-client';
import { type Logger } from 'matrix-js-sdk/lib/logger';
import { combineLatest } from 'rxjs';

import type { DeepFilterNoiseFilterProcessor } from 'deepfilternet3-noise-filter';
import { trimTrailingSlash } from '../../../../utils/common';
import { callSettings } from '../settings';
import { VoiceGateProcessor } from './voiceGate';
import { processingAudioContext } from './processingAudioContext';
import { type Behavior } from '../state/Behavior';
import { type ObservableScope } from '../state/ObservableScope';

/**
 * Client-side noise suppression for the microphone track: DeepFilterNet 3
 * (`deepfilternet3-noise-filter`) running in an AudioWorklet on the published
 * track. Pure denoising — no EQ, AGC or compression is bolted on, and the
 * model weights are self-hosted under `public/df3/`.
 *
 * The browser's own noise suppression and AGC are disabled in every mode
 * (see ConnectionFactory): the mic is captured raw, and echo cancellation
 * stays with the browser because it needs the far-end reference signal.
 */

/** Cheap synchronous capability estimate; downloads nothing. */
export function denoiseSupported(): boolean {
  return (
    typeof AudioWorkletNode !== 'undefined' &&
    typeof WebAssembly === 'object' &&
    typeof WebAssembly.compileStreaming === 'function'
  );
}

/**
 * DeepFilterNet's maximum attenuation in dB. Upstream default; higher values
 * remove more noise but sound more gated.
 */
const DenoiseAttenuationLimitDb = 40;

let module:
  | Promise<{
      DeepFilterNoiseFilterProcessor: typeof DeepFilterNoiseFilterProcessor;
    }>
  | undefined;
async function load(): Promise<{
  DeepFilterNoiseFilterProcessor: typeof DeepFilterNoiseFilterProcessor;
}> {
  module ??= import('deepfilternet3-noise-filter');
  return module;
}

/** The DeepFilterNet runtime and model, served next to the app (`public/df3/`). */
const DF3_ASSETS_URL = `${trimTrailingSlash(import.meta.env.BASE_URL)}/public/df3`;

/** What a track is currently processed with, so repeat emissions stay no-ops. */
const applied = new WeakMap<LocalAudioTrack, string>();

const processingKey = (denoise: boolean, gate: boolean): string =>
  `${denoise && denoiseSupported() ? 'dfn' : 'off'}${gate ? '+gate' : ''}`;

async function applyProcessing(
  track: LocalAudioTrack,
  denoise: boolean,
  gate: boolean
): Promise<void> {
  let denoiser: DeepFilterNoiseFilterProcessor | undefined;
  if (denoise && denoiseSupported()) {
    const { DeepFilterNoiseFilterProcessor } = await load();
    denoiser = new DeepFilterNoiseFilterProcessor({
      enabled: true,
      noiseReductionLevel: DenoiseAttenuationLimitDb,
      assetConfig: { cdnUrl: DF3_ASSETS_URL },
    });
    // The processor only makes a context of its own (with an output stream) when it has none.
    denoiser.audioContext = processingAudioContext({ sampleRate: 48000 });
  }
  const processor = gate
    ? new VoiceGateProcessor(denoiser, () => ({
        auto: callSettings.voiceGateAuto$.value,
        threshold: callSettings.voiceGateThreshold$.value,
        tuning: callSettings.voiceTuning$.value,
      }))
    : denoiser;
  if (processor === undefined) {
    await track.stopProcessor();
    return;
  }
  try {
    await track.setProcessor(processor);
  } catch (e) {
    // A processor the track did not take is still ours to free (its audio context included).
    if (track.getProcessor() !== processor) await processor.destroy().catch(() => undefined);
    throw e;
  }
}

/**
 * Keeps the browser's automatic gain control on the microphone capture in step
 * with the setting. The mic is always opened with it off (see ConnectionFactory);
 * turning it on re-constrains the live track, so no re-capture is needed and the
 * level is corrected before the denoiser and voice gate see the signal.
 */
export function autoGainSync(
  scope: ObservableScope,
  audioTrack$: Behavior<LocalAudioTrack | null>,
  logger: Logger
): void {
  combineLatest([audioTrack$, callSettings.autoGain$])
    .pipe(scope.bind())
    .subscribe(([track, enabled]) => {
      if (track === null) return;
      track.mediaStreamTrack
        .applyConstraints({ autoGainControl: enabled })
        .catch((e) => logger.warn('Failed to set microphone auto gain', e));
    });
}

/**
 * Keeps the microphone track of a room in sync with the denoise mode.
 * Mirrors trackProcessorSync (background blur) for audio.
 */
export function denoiseSync(
  scope: ObservableScope,
  audioTrack$: Behavior<LocalAudioTrack | null>,
  logger: Logger
): void {
  let previous: LocalAudioTrack | null = null;
  combineLatest([audioTrack$, callSettings.denoise$, callSettings.voiceGate$])
    .pipe(scope.bind())
    .subscribe(([track, denoise, gate]) => {
      // A replaced track is stopped by LiveKit without destroying a processor
      // still attached to it; the processor's AudioContext must be closed.
      if (previous !== null && previous !== track && (applied.get(previous) ?? 'off') !== 'off') {
        void previous.stopProcessor().catch(() => {});
      }
      previous = track;
      if (track === null) return;
      const key = processingKey(denoise, gate);
      if ((applied.get(track) ?? 'off') === key) return;
      // Claim the key while applying so concurrent emissions don't double
      // apply, but release it on failure so a later emission retries.
      applied.set(track, key);
      applyProcessing(track, denoise, gate).catch((e) => {
        if (applied.get(track) === key) applied.delete(track);
        logger.error('Failed to apply microphone processing', e);
      });
    });
}

/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type LocalAudioTrack } from "livekit-client";
import { type Logger } from "matrix-js-sdk/lib/logger";
import { combineLatest } from "rxjs";

import type { DeepFilterNoiseFilterProcessor } from "deepfilternet3-noise-filter";
import {
  autoGain as autoGainSetting,
  denoiseMode as denoiseModeSetting,
  voiceGate,
  voiceGateAuto,
  voiceGateThreshold,
  voiceTuning,
} from "../settings/settings";
import { VoiceGateProcessor } from "./voiceGate";
import { type Behavior } from "../state/Behavior";
import { type ObservableScope } from "../state/ObservableScope";

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

export type DenoiseMode = "off" | "deepfilternet";

/** Cheap synchronous capability estimate; downloads nothing. */
export function denoiseSupported(): boolean {
  return (
    typeof AudioWorkletNode !== "undefined" &&
    typeof WebAssembly === "object" &&
    typeof WebAssembly.compileStreaming === "function"
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
  module ??= import("deepfilternet3-noise-filter");
  return module;
}

/** What a track is currently processed with, so repeat emissions stay no-ops. */
const applied = new WeakMap<LocalAudioTrack, string>();

const processingKey = (mode: DenoiseMode, gate: boolean): string =>
  `${mode === "deepfilternet" && denoiseSupported() ? "dfn" : "off"}${gate ? "+gate" : ""}`;

async function applyProcessing(
  track: LocalAudioTrack,
  mode: DenoiseMode,
  gate: boolean,
): Promise<void> {
  let denoiser: DeepFilterNoiseFilterProcessor | undefined;
  if (mode === "deepfilternet" && denoiseSupported()) {
    const { DeepFilterNoiseFilterProcessor } = await load();
    denoiser = new DeepFilterNoiseFilterProcessor({
      enabled: true,
      noiseReductionLevel: DenoiseAttenuationLimitDb,
      assetConfig: { cdnUrl: "df3" },
    });
  }
  if (gate) {
    await track.setProcessor(
      new VoiceGateProcessor(denoiser, () => ({
        auto: voiceGateAuto.getValue(),
        threshold: voiceGateThreshold.getValue(),
        tuning: voiceTuning.getValue(),
      })),
    );
  } else if (denoiser) {
    await track.setProcessor(denoiser);
  } else {
    await track.stopProcessor();
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
  logger: Logger,
): void {
  combineLatest([audioTrack$, autoGainSetting.value$])
    .pipe(scope.bind())
    .subscribe(([track, enabled]) => {
      if (track === null) return;
      track.mediaStreamTrack
        .applyConstraints({ autoGainControl: enabled })
        .catch((e) => logger.warn("Failed to set microphone auto gain", e));
    });
}

/**
 * Keeps the microphone track of a room in sync with the denoise mode.
 * Mirrors trackProcessorSync (background blur) for audio.
 */
export function denoiseSync(
  scope: ObservableScope,
  audioTrack$: Behavior<LocalAudioTrack | null>,
  logger: Logger,
): void {
  let previous: LocalAudioTrack | null = null;
  combineLatest([audioTrack$, denoiseModeSetting.value$, voiceGate.value$])
    .pipe(scope.bind())
    .subscribe(([track, mode, gate]) => {
      // A replaced track is stopped by LiveKit without destroying a processor
      // still attached to it; the processor's AudioContext must be closed.
      if (
        previous !== null &&
        previous !== track &&
        (applied.get(previous) ?? "off") !== "off"
      ) {
        void previous.stopProcessor().catch(() => {});
      }
      previous = track;
      if (track === null) return;
      const key = processingKey(mode, gate);
      if ((applied.get(track) ?? "off") === key) return;
      // Claim the key while applying so concurrent emissions don't double
      // apply, but release it on failure so a later emission retries.
      applied.set(track, key);
      applyProcessing(track, mode, gate).catch((e) => {
        if (applied.get(track) === key) applied.delete(track);
        logger.error("Failed to apply microphone processing", e);
      });
    });
}

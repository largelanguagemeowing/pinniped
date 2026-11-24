/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type VoiceTuning } from '../../voiceTuning';
import { AdaptiveVoiceGate, VoiceGate, measureLevel, voiceGateLevels } from './voiceActivity';

const POLL_MS = 20;
/** The most lookahead the delay line can give (see VoiceTuning.lookaheadMs). */
const MAX_LOOKAHEAD_S = 0.1;

/** The gate settings, read as the gate runs. */
export type VoiceGateSettings = () => {
  /** Follow the noise floor instead of `threshold`. */
  auto: boolean;
  /** 0-1 level that opens the gate when not automatic. */
  threshold: number;
  tuning: VoiceTuning;
};

/**
 * Sends `input` to `output` only while it carries speech: the signal plays through a gain that
 * opens and closes on the level an analyser hears, behind a delay line so speech that opens the
 * gate is not cut off. Returns the function that takes the stage apart.
 */
export function attachVoiceGate(
  ctx: AudioContext,
  input: AudioNode,
  output: AudioNode,
  settings: VoiceGateSettings
): () => void {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const delay = ctx.createDelay(MAX_LOOKAHEAD_S);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  input.connect(analyser);
  input.connect(delay);
  delay.connect(gain);
  gain.connect(output);

  const samples = new Float32Array(analyser.fftSize);
  const fixed = new VoiceGate();
  const adaptive = new AdaptiveVoiceGate();
  let open = false;
  const id = setInterval(() => {
    const { auto, threshold, tuning } = settings();
    const levels = voiceGateLevels(threshold, tuning.hysteresisDb);
    fixed.setLevels(levels.open, levels.close);
    fixed.holdMs = tuning.holdMs;
    adaptive.holdMs = tuning.holdMs;
    adaptive.marginDb = tuning.autoMarginDb;
    adaptive.hysteresisDb = tuning.hysteresisDb;
    delay.delayTime.value = tuning.lookaheadMs / 1000;
    const next = (auto ? adaptive : fixed).update(measureLevel(analyser, samples), Date.now());
    if (next === open) return;
    open = next;
    gain.gain.setTargetAtTime(
      open ? 1 : 0,
      ctx.currentTime,
      (open ? tuning.fadeInMs : tuning.fadeOutMs) / 1000
    );
  }, POLL_MS);

  return (): void => {
    clearInterval(id);
    input.disconnect(analyser);
    input.disconnect(delay);
    analyser.disconnect();
    delay.disconnect();
    gain.disconnect();
  };
}

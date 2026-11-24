/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// Runs inside the voice gate's AudioWorklet, so it imports only pure modules.
import { type VoiceTuning } from '../../voiceTuning';
import { AdaptiveVoiceGate, VoiceGate, voiceGateLevels } from './voiceGateLogic';

/** The name the worklet module registers its processor under. */
export const VOICE_GATE_PROCESSOR = 'voice-gate';

/** The gate settings. */
export type VoiceGateConfig = {
  /** Follow the noise floor instead of `threshold`. */
  auto: boolean;
  /** 0-1 level that opens the gate when not automatic. */
  threshold: number;
  tuning: VoiceTuning;
};

/** The most lookahead the delay line can give (see VoiceTuning.lookaheadMs). */
const MAX_LOOKAHEAD_S = 0.1;
/** The level is the RMS of this many of the latest samples. */
const WINDOW = 1024;
/** The gate decides this often; its filters are tuned to this rate. */
const DECISION_S = 0.02;
/** A closing gain this small is exactly silence, so a closed gate sends digital silence. */
const SILENT_GAIN = 1e-5;

/**
 * Sends the input on only while it carries speech: the signal plays through a gain that opens
 * and closes on the level of the last {@link WINDOW} samples, behind a delay line so the speech
 * that opens the gate is not cut off. Everything is counted in samples of the audio itself, so
 * the output does not depend on when or in what blocks it is rendered.
 */
export class VoiceGateDsp {
  private readonly fixed = new VoiceGate();

  private readonly adaptive = new AdaptiveVoiceGate();

  private config: VoiceGateConfig | undefined;

  private auto = false;

  private readonly decisionEvery: number;

  /** Mono mix of the latest input, for the level. */
  private readonly window = new Float32Array(WINDOW);

  private readonly delay: [Float32Array, Float32Array];

  /** Frames written so far; the delay line and the window index by it. */
  private frame = 0;

  private nextDecision: number;

  private open = false;

  private gain = 0;

  public constructor(private readonly sampleRate: number) {
    const size = Math.ceil(MAX_LOOKAHEAD_S * sampleRate) + 1;
    this.delay = [new Float32Array(size), new Float32Array(size)];
    this.decisionEvery = Math.max(1, Math.round(DECISION_S * sampleRate));
    this.nextDecision = this.decisionEvery;
  }

  /** Applies new settings; takes effect on the next block. */
  public configure(config: VoiceGateConfig): void {
    this.config = config;
    const { auto, threshold, tuning } = config;
    const levels = voiceGateLevels(threshold, tuning.hysteresisDb);
    this.fixed.setLevels(levels.open, levels.close);
    this.fixed.holdMs = tuning.holdMs;
    this.adaptive.holdMs = tuning.holdMs;
    this.adaptive.marginDb = tuning.autoMarginDb;
    this.adaptive.hysteresisDb = tuning.hysteresisDb;
    this.auto = auto;
  }

  /**
   * Renders one block. `input` and `output` are the left and right channels (an input without
   * channels is silence); a mono input is heard on both sides. Until configured, the gate is
   * closed.
   */
  public process(input: Float32Array[], output: [Float32Array, Float32Array]): void {
    const left = input[0];
    const right = input[1] ?? left;
    const frames = output[0].length;
    const config = this.config;
    const size = this.delay[0].length;
    const lookahead = Math.min(
      size - 1,
      Math.max(0, Math.round(((config?.tuning.lookaheadMs ?? 0) / 1000) * this.sampleRate))
    );
    const fadeInCoef = fadeCoefficient(config?.tuning.fadeInMs ?? 0, this.sampleRate);
    const fadeOutCoef = fadeCoefficient(config?.tuning.fadeOutMs ?? 0, this.sampleRate);

    for (let i = 0; i < frames; i++) {
      const l = left?.[i] ?? 0;
      const r = right?.[i] ?? 0;
      const at = this.frame % size;
      this.delay[0][at] = l;
      this.delay[1][at] = r;
      this.window[this.frame % WINDOW] = (l + r) / 2;
      this.frame++;

      if (this.frame >= this.nextDecision) {
        this.nextDecision += this.decisionEvery;
        if (config !== undefined) this.decide();
      }

      const target = this.open ? 1 : 0;
      this.gain += (target - this.gain) * (1 - (this.open ? fadeInCoef : fadeOutCoef));
      if (target === 0 && this.gain < SILENT_GAIN) this.gain = 0;

      const from = (at - lookahead + size) % size;
      output[0][i] = this.delay[0][from] * this.gain;
      output[1][i] = this.delay[1][from] * this.gain;
    }
  }

  private decide(): void {
    let sum = 0;
    for (const s of this.window) sum += s * s;
    const level = Math.sqrt(sum / WINDOW);
    const now = (this.frame / this.sampleRate) * 1000;
    this.open = (this.auto ? this.adaptive : this.fixed).update(level, now);
  }
}

/** The per-sample decay of the distance to the target, for a time constant in ms. */
function fadeCoefficient(ms: number, sampleRate: number): number {
  const samples = (ms / 1000) * sampleRate;
  return samples < 1 ? 0 : Math.exp(-1 / samples);
}

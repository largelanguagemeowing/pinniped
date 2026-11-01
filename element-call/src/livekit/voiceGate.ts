/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type AudioProcessorOptions,
  type Track,
  type TrackProcessor,
} from "livekit-client";

import { type VoiceTuning } from "./voiceTuning";
import {
  AdaptiveVoiceGate,
  VoiceGate,
  measureLevel,
  voiceGateLevels,
} from "./voiceActivity";

type AudioProcessor = TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>;

const POLL_MS = 20;
/** The most lookahead the delay line can give (see VoiceTuning.lookaheadMs). */
const MAX_LOOKAHEAD_S = 0.1;

/**
 * Sends the microphone only while it is picking up speech. It wraps the
 * denoiser (if there is one) and sits after it: the denoiser keeps processing
 * everything, so its noise model keeps adapting while the gate is closed, and
 * the gate listens to the cleaned signal, so room noise does not open it.
 */
export class VoiceGateProcessor implements AudioProcessor {
  public readonly name = "voice-gate";
  public processedTrack?: MediaStreamTrack;

  private teardown?: () => void;

  /**
   * @param inner - the denoiser to run before the gate, if any
   * @param settings - the current gate settings, read as the gate runs:
   *   `auto` follows the noise floor, otherwise `threshold` (0-1) applies
   */
  public constructor(
    private readonly inner: AudioProcessor | undefined,
    private readonly settings: () => {
      auto: boolean;
      threshold: number;
      tuning: VoiceTuning;
    },
  ) {}

  // livekit-client's restartTrack calls restart() without an audioContext, so
  // keep the one init() was given and fall back to it.
  private audioContext?: AudioContext;

  public async init(opts: AudioProcessorOptions): Promise<void> {
    this.audioContext = opts.audioContext;
    await this.inner?.init(opts);
    this.build(this.inner?.processedTrack ?? opts.track, opts.audioContext);
  }

  public async restart(opts: AudioProcessorOptions): Promise<void> {
    const ctx = opts.audioContext ?? this.audioContext;
    if (!ctx) throw new Error("VoiceGate: no AudioContext to restart with");
    this.audioContext = ctx;
    this.teardown?.();
    await this.inner?.restart({ ...opts, audioContext: ctx });
    this.build(this.inner?.processedTrack ?? opts.track, ctx);
  }

  public async destroy(): Promise<void> {
    this.teardown?.();
    this.teardown = undefined;
    this.processedTrack = undefined;
    await this.inner?.destroy();
  }

  private build(source: MediaStreamTrack, ctx: AudioContext): void {
    ctx.resume().catch(() => {});
    const input = ctx.createMediaStreamSource(new MediaStream([source]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const delay = ctx.createDelay(MAX_LOOKAHEAD_S);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const output = ctx.createMediaStreamDestination();
    input.connect(analyser);
    input.connect(delay);
    delay.connect(gain);
    gain.connect(output);
    this.processedTrack = output.stream.getAudioTracks()[0];

    const samples = new Float32Array(analyser.fftSize);
    const fixed = new VoiceGate();
    const adaptive = new AdaptiveVoiceGate();
    let open = false;
    const id = setInterval(() => {
      const { auto, threshold, tuning } = this.settings();
      const levels = voiceGateLevels(threshold, tuning.hysteresisDb);
      fixed.setLevels(levels.open, levels.close);
      fixed.holdMs = tuning.holdMs;
      adaptive.holdMs = tuning.holdMs;
      adaptive.marginDb = tuning.autoMarginDb;
      adaptive.hysteresisDb = tuning.hysteresisDb;
      delay.delayTime.value = tuning.lookaheadMs / 1000;
      const next = (auto ? adaptive : fixed).update(
        measureLevel(analyser, samples),
        Date.now(),
      );
      if (next === open) return;
      open = next;
      gain.gain.setTargetAtTime(
        open ? 1 : 0,
        ctx.currentTime,
        (open ? tuning.fadeInMs : tuning.fadeOutMs) / 1000,
      );
    }, POLL_MS);

    this.teardown = (): void => {
      clearInterval(id);
      input.disconnect();
      analyser.disconnect();
      delay.disconnect();
      gain.disconnect();
      this.processedTrack?.stop();
    };
  }
}

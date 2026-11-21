/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type AudioProcessorOptions,
  type LocalAudioTrack,
  type Track,
  type TrackProcessor,
} from 'livekit-client';
import { type Logger } from 'matrix-js-sdk/lib/logger';
import { combineLatest } from 'rxjs';

import { type VoiceTuning } from '../../voiceTuning';
import { callSettings } from '../settings';
import { type Behavior } from '../state/Behavior';
import { type ObservableScope } from '../state/ObservableScope';
import { AdaptiveVoiceGate, VoiceGate, measureLevel, voiceGateLevels } from './voiceActivity';

type AudioProcessor = TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>;

const POLL_MS = 20;
/** The most lookahead the delay line can give (see VoiceTuning.lookaheadMs). */
const MAX_LOOKAHEAD_S = 0.1;

/**
 * Sends the microphone only while it is picking up speech: the track plays through a gain that
 * opens and closes on the level an analyser hears, behind a delay line so speech that opens the
 * gate is not cut off.
 */
export class VoiceGateProcessor implements AudioProcessor {
  public readonly name = 'voice-gate';
  public processedTrack?: MediaStreamTrack;

  private teardown?: () => void;

  /**
   * @param settings - the current gate settings, read as the gate runs:
   *   `auto` follows the noise floor, otherwise `threshold` (0-1) applies
   */
  public constructor(
    private readonly settings: () => {
      auto: boolean;
      threshold: number;
      tuning: VoiceTuning;
    }
  ) {}

  // livekit-client's restartTrack calls restart() without an audioContext, so
  // keep the one init() was given and fall back to it.
  private audioContext?: AudioContext;

  public async init(opts: AudioProcessorOptions): Promise<void> {
    this.audioContext = opts.audioContext;
    this.build(opts.track, opts.audioContext);
  }

  public async restart(opts: AudioProcessorOptions): Promise<void> {
    const ctx = opts.audioContext ?? this.audioContext;
    if (!ctx) throw new Error('VoiceGate: no AudioContext to restart with');
    this.audioContext = ctx;
    this.teardown?.();
    this.build(opts.track, ctx);
  }

  public async destroy(): Promise<void> {
    this.teardown?.();
    this.teardown = undefined;
    this.processedTrack = undefined;
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
      const next = (auto ? adaptive : fixed).update(measureLevel(analyser, samples), Date.now());
      if (next === open) return;
      open = next;
      gain.gain.setTargetAtTime(
        open ? 1 : 0,
        ctx.currentTime,
        (open ? tuning.fadeInMs : tuning.fadeOutMs) / 1000
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

/** Whether a track has the gate, so repeat emissions stay no-ops. */
const gated = new WeakMap<LocalAudioTrack, boolean>();

async function applyGate(track: LocalAudioTrack, gate: boolean): Promise<void> {
  if (!gate) {
    await track.stopProcessor();
    return;
  }
  const processor = new VoiceGateProcessor(() => ({
    auto: callSettings.voiceGateAuto$.value,
    threshold: callSettings.voiceGateThreshold$.value,
    tuning: callSettings.voiceTuning$.value,
  }));
  try {
    await track.setProcessor(processor);
  } catch (e) {
    // A processor the track did not take is still ours to free.
    if (track.getProcessor() !== processor) await processor.destroy().catch(() => undefined);
    throw e;
  }
}

/** Keeps the microphone track of a room gated while the voice gate setting is on. */
export function voiceGateSync(
  scope: ObservableScope,
  audioTrack$: Behavior<LocalAudioTrack | null>,
  logger: Logger
): void {
  let previous: LocalAudioTrack | null = null;
  combineLatest([audioTrack$, callSettings.voiceGate$])
    .pipe(scope.bind())
    .subscribe(([track, gate]) => {
      // A replaced track is stopped by LiveKit without destroying a gate still attached to it,
      // which would keep polling.
      if (previous !== null && previous !== track && gated.get(previous) === true) {
        void previous.stopProcessor().catch(() => {});
      }
      previous = track;
      if (track === null) return;
      if ((gated.get(track) ?? false) === gate) return;
      // Claim the state while applying so concurrent emissions don't apply twice, but release it
      // on failure so a later emission retries.
      gated.set(track, gate);
      applyGate(track, gate).catch((e) => {
        if (gated.get(track) === gate) gated.delete(track);
        logger.error('Failed to apply the voice gate', e);
      });
    });
}

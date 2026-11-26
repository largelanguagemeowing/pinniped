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
import { combineLatest, map, type Observable } from 'rxjs';

import { callSettings } from '../settings';
import { type Behavior } from '../state/Behavior';
import { type ObservableScope } from '../state/ObservableScope';
import { createMonoMix } from './monoMix';
import { sendingAudioContext } from './processingAudioContext';
import { attachVoiceGate, loadVoiceGate, type VoiceGateConfig } from './voiceGate';

type AudioProcessor = TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>;

/** The stages of the microphone's path to the network; a track takes one processor, so one chain. */
export type MicStages = {
  /** Mix the capture down to one channel. */
  mono: boolean;
  /** Send only while speaking, with these settings as they change; null sends continuously. */
  gate: Observable<VoiceGateConfig> | null;
};

/**
 * The microphone's audio graph: capture, then the mono mix, then the voice gate, then out.
 *
 * It runs in an audio context of its own that an output device clocks (see
 * `sendingAudioContext`), not in the one LiveKit hands a processor: that one has no output
 * (patches/livekit-client), so a timer renders it, and where the timer is coarse it rendered a
 * third less audio than the microphone delivered. The voice came out cut up, and played with
 * gaps for everyone else.
 */
export class MicProcessor implements AudioProcessor {
  public readonly name = 'mic-processing';
  public processedTrack?: MediaStreamTrack;

  private teardown?: () => void;

  private ctx?: AudioContext;

  // Counts starts and destroys, so a graph is not built for a start that was destroyed while
  // the gate's worklet was loading.
  private epoch = 0;

  /**
   * @param onFailed - Called when the context's output device fails, which stops the graph: the
   * microphone is silent until another processor (with a new context) replaces this one.
   */
  public constructor(
    private readonly stages: MicStages,
    private readonly onFailed?: () => void
  ) {}

  private readonly failed = (): void => this.onFailed?.();

  /** The graph's context, made on the first start and again after a destroy. */
  private context(): AudioContext {
    if (this.ctx === undefined || this.ctx.state === 'closed') {
      this.ctx = sendingAudioContext({ latencyHint: 'interactive' });
      this.ctx.addEventListener('error', this.failed);
    }
    return this.ctx;
  }

  public async init(opts: AudioProcessorOptions): Promise<void> {
    const epoch = ++this.epoch;
    const ctx = this.context();
    if (this.stages.gate) await loadVoiceGate(ctx);
    if (epoch === this.epoch) this.build(opts.track, ctx);
  }

  public async restart(opts: AudioProcessorOptions): Promise<void> {
    const epoch = ++this.epoch;
    const ctx = this.context();
    if (this.stages.gate) await loadVoiceGate(ctx);
    if (epoch !== this.epoch) return;
    this.teardown?.();
    this.build(opts.track, ctx);
  }

  public async destroy(): Promise<void> {
    this.epoch++;
    this.teardown?.();
    this.teardown = undefined;
    this.processedTrack = undefined;
    const ctx = this.ctx;
    this.ctx = undefined;
    ctx?.removeEventListener('error', this.failed);
    // Its output stream goes with it.
    await ctx?.close().catch(() => undefined);
  }

  private build(source: MediaStreamTrack, ctx: AudioContext): void {
    ctx.resume().catch(() => {});
    const { mono, gate } = this.stages;
    const input = ctx.createMediaStreamSource(new MediaStream([source]));
    const output = ctx.createMediaStreamDestination();
    // One channel out, so the track is published as mono as well.
    if (mono) output.channelCount = 1;
    this.processedTrack = output.stream.getAudioTracks()[0];

    // Each stage plugs into `head`, the node the previous one ended in.
    const undo: (() => void)[] = [];
    let head: AudioNode = input;
    if (mono) {
      const mix = createMonoMix(ctx);
      input.connect(mix);
      head = mix;
      undo.push(() => mix.disconnect());
    }
    if (gate) undo.push(attachVoiceGate(ctx, head, output, gate));
    else head.connect(output);

    this.teardown = (): void => {
      undo.forEach((f) => f());
      input.disconnect();
      this.processedTrack?.stop();
    };
  }
}

/** The gate's settings, which apply while it runs. */
const gateConfig$: Observable<VoiceGateConfig> = combineLatest([
  callSettings.voiceGateAuto$,
  callSettings.voiceGateThreshold$,
  callSettings.voiceTuning$,
]).pipe(map(([auto, threshold, tuning]) => ({ auto, threshold, tuning })));

/** A processor whose device fails is replaced at most this often, so a dead device cannot spin. */
const RESTART_INTERVAL_MS = 10_000;

/** Which stages a track has, so repeat emissions stay no-ops. */
const applied = new WeakMap<LocalAudioTrack, { mono: boolean; gate: boolean }>();

async function applyStages(
  track: LocalAudioTrack,
  stages: MicStages,
  onFailed: () => void
): Promise<void> {
  if (!stages.mono && !stages.gate) {
    await track.stopProcessor();
    return;
  }
  const processor: MicProcessor = new MicProcessor(stages, () => {
    if (track.getProcessor() === processor) onFailed();
  });
  try {
    await track.setProcessor(processor);
  } catch (e) {
    // A processor the track did not take is still ours to free.
    if (track.getProcessor() !== processor) await processor.destroy().catch(() => undefined);
    throw e;
  }
}

/**
 * Keeps the microphone track of a room processed as the settings say: mixed to mono and/or gated
 * by voice activity. A change replaces the processor.
 */
export function micProcessingSync(
  scope: ObservableScope,
  audioTrack$: Behavior<LocalAudioTrack | null>,
  logger: Logger
): void {
  let previous: LocalAudioTrack | null = null;
  let lastRestart = -Infinity;
  combineLatest([audioTrack$, callSettings.voiceGate$, callSettings.monoMic$])
    .pipe(scope.bind())
    .subscribe(([track, gate, mono]) => {
      // A replaced track is stopped by LiveKit without destroying a processor still attached to
      // it, which would keep a gate polling.
      const was = previous === null ? undefined : applied.get(previous);
      if (previous !== null && previous !== track && (was?.gate || was?.mono)) {
        void previous.stopProcessor().catch(() => {});
      }
      previous = track;
      if (track === null) return;
      const before = applied.get(track);
      if ((before?.gate ?? false) === gate && (before?.mono ?? false) === mono) return;
      const apply = (): void => {
        // Claim the state while applying so concurrent emissions don't apply twice, but release
        // it on failure so a later emission retries.
        const claim = { gate, mono };
        applied.set(track, claim);
        const stages: MicStages = {
          mono,
          gate: gate ? gateConfig$ : null,
        };
        const restart = (): void => {
          // Only while this is still the microphone and these are still its stages.
          if (previous !== track || applied.get(track) !== claim) return;
          const now = Date.now();
          if (now - lastRestart < RESTART_INTERVAL_MS) {
            logger.error("The microphone processing's audio device keeps failing; giving up");
            return;
          }
          lastRestart = now;
          logger.warn("The microphone processing's audio device failed; restarting it");
          apply();
        };
        applyStages(track, stages, restart).catch((e) => {
          if (applied.get(track) === claim) applied.delete(track);
          logger.error('Failed to process the microphone', e);
        });
      };
      apply();
    });
}

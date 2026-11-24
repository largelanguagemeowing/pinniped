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
import { attachVoiceGate, loadVoiceGate, type VoiceGateConfig } from './voiceGate';

type AudioProcessor = TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>;

/** The stages of the microphone's path to the network; a track takes one processor, so one chain. */
export type MicStages = {
  /** Mix the capture down to one channel. */
  mono: boolean;
  /** Send only while speaking, with these settings as they change; null sends continuously. */
  gate: Observable<VoiceGateConfig> | null;
};

/** The microphone's audio graph: capture, then the mono mix, then the voice gate, then out. */
export class MicProcessor implements AudioProcessor {
  public readonly name = 'mic-processing';
  public processedTrack?: MediaStreamTrack;

  private teardown?: () => void;

  public constructor(private readonly stages: MicStages) {}

  // livekit-client's restartTrack calls restart() without an audioContext, so
  // keep the one init() was given and fall back to it.
  private audioContext?: AudioContext;

  // Counts starts and destroys, so a graph is not built for a start that was destroyed while
  // the gate's worklet was loading.
  private epoch = 0;

  public async init(opts: AudioProcessorOptions): Promise<void> {
    this.audioContext = opts.audioContext;
    const epoch = ++this.epoch;
    if (this.stages.gate) await loadVoiceGate(opts.audioContext);
    if (epoch === this.epoch) this.build(opts.track, opts.audioContext);
  }

  public async restart(opts: AudioProcessorOptions): Promise<void> {
    const ctx = opts.audioContext ?? this.audioContext;
    if (!ctx) throw new Error('MicProcessor: no AudioContext to restart with');
    this.audioContext = ctx;
    const epoch = ++this.epoch;
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

/** Which stages a track has, so repeat emissions stay no-ops. */
const applied = new WeakMap<LocalAudioTrack, { mono: boolean; gate: boolean }>();

async function applyStages(track: LocalAudioTrack, stages: MicStages): Promise<void> {
  if (!stages.mono && !stages.gate) {
    await track.stopProcessor();
    return;
  }
  const processor = new MicProcessor(stages);
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
      // Claim the state while applying so concurrent emissions don't apply twice, but release it
      // on failure so a later emission retries.
      const claim = { gate, mono };
      applied.set(track, claim);
      const stages: MicStages = {
        mono,
        gate: gate ? gateConfig$ : null,
      };
      applyStages(track, stages).catch((e) => {
        if (applied.get(track) === claim) applied.delete(track);
        logger.error('Failed to process the microphone', e);
      });
    });
}

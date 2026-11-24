/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { type LocalAudioTrack } from 'livekit-client';
import { logger } from 'matrix-js-sdk/lib/logger';

import {
  MicProcessor,
  micProcessingSync,
} from '../../../../src/app/plugins/call/engine/livekit/micProcessor';
import { ObservableScope } from '../../../../src/app/plugins/call/engine/state/ObservableScope';
import { appStore } from '../../../../src/app/state/appStore';
import { settingsAtom } from '../../../../src/app/state/settings';

const setGate = (on: boolean) =>
  appStore.set(settingsAtom, { ...appStore.get(settingsAtom), callVoiceGate: on });
const setMono = (on: boolean) =>
  appStore.set(settingsAtom, { ...appStore.get(settingsAtom), callMonoMic: on });

// A microphone track that keeps whatever processor it is given.
const micTrack = () => {
  let processor: unknown;
  const track = {
    setProcessor: vi.fn(async (p: unknown) => {
      processor = p;
    }),
    getProcessor: () => processor,
    stopProcessor: vi.fn(async () => {
      processor = undefined;
    }),
  };
  return track as typeof track & LocalAudioTrack;
};

// A microphone track whose processor setup fails; `takes` is whether it kept the processor anyway.
const failingTrack = (takes: boolean) => {
  let kept: unknown;
  return {
    setProcessor: async (processor: unknown) => {
      if (takes) kept = processor;
      throw new Error('setup failed');
    },
    getProcessor: () => kept,
    stopProcessor: async () => undefined,
  } as unknown as LocalAudioTrack;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let scope: ObservableScope;
beforeEach(() => {
  scope = new ObservableScope();
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  scope.end();
  setGate(false);
  setMono(false);
  vi.restoreAllMocks();
});

describe('the voice gate and mono settings', () => {
  it('gates the microphone while it is on', async () => {
    setGate(false);
    const track = micTrack();
    micProcessingSync(scope, new BehaviorSubject<LocalAudioTrack | null>(track), logger);
    await settle();
    expect(track.getProcessor()).toBeUndefined();

    setGate(true);
    await settle();
    expect(track.getProcessor()).toBeInstanceOf(MicProcessor);

    setGate(false);
    await settle();
    expect(track.getProcessor()).toBeUndefined();
  });

  it('processes the microphone for mono alone, and replaces the processor as settings change', async () => {
    const track = micTrack();
    micProcessingSync(scope, new BehaviorSubject<LocalAudioTrack | null>(track), logger);
    await settle();
    expect(track.setProcessor).not.toHaveBeenCalled();

    setMono(true);
    await settle();
    const mono = track.getProcessor();
    expect(mono).toBeInstanceOf(MicProcessor);

    setGate(true);
    await settle();
    expect(track.getProcessor()).toBeInstanceOf(MicProcessor);
    expect(track.getProcessor()).not.toBe(mono);

    setGate(false);
    setMono(false);
    await settle();
    expect(track.getProcessor()).toBeUndefined();
  });

  it('frees the processor of a microphone track that was replaced', async () => {
    setGate(true);
    const first = micTrack();
    const track$ = new BehaviorSubject<LocalAudioTrack | null>(first);
    micProcessingSync(scope, track$, logger);
    await settle();

    const second = micTrack();
    track$.next(second);
    await settle();
    expect(first.stopProcessor).toHaveBeenCalled();
    expect(second.getProcessor()).toBeInstanceOf(MicProcessor);
  });
});

describe('a microphone processor that fails to start', () => {
  beforeEach(() => setGate(true));

  it('is freed when the track did not take it', async () => {
    const destroy = vi.spyOn(MicProcessor.prototype, 'destroy');
    micProcessingSync(scope, new BehaviorSubject(failingTrack(false)), logger);
    await settle();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('is left to the track that took it', async () => {
    const destroy = vi.spyOn(MicProcessor.prototype, 'destroy');
    micProcessingSync(scope, new BehaviorSubject(failingTrack(true)), logger);
    await settle();
    expect(destroy).not.toHaveBeenCalled();
  });
});

// An audio context that records its nodes and what is connected to what.
class GraphContext {
  readonly nodes: FakeNode[] = [];

  currentTime = 0;

  async resume(): Promise<void> {}

  private node(kind: string, extra: object = {}): FakeNode {
    const n = new FakeNode(kind, extra);
    this.nodes.push(n);
    return n;
  }

  createMediaStreamSource = () => this.node('source');

  createMediaStreamDestination = () =>
    this.node('destination', {
      channelCount: 2,
      stream: { getAudioTracks: () => [{ stop: vi.fn() }] },
    });

  createGain = () =>
    this.node('gain', { channelCount: 2, gain: { value: 1, setTargetAtTime() {} } });

  createAnalyser = () =>
    this.node('analyser', { fftSize: 0, getFloatTimeDomainData: () => undefined });

  createDelay = () => this.node('delay', { delayTime: { value: 0 } });
}

class FakeNode {
  readonly targets = new Set<FakeNode>();

  [key: string]: unknown;

  constructor(
    readonly kind: string,
    extra: object
  ) {
    Object.assign(this, extra);
  }

  connect(to: FakeNode): FakeNode {
    this.targets.add(to);
    return to;
  }

  disconnect(to?: FakeNode): void {
    if (to) this.targets.delete(to);
    else this.targets.clear();
  }
}

describe('the microphone graph', () => {
  const build = (stages: ConstructorParameters<typeof MicProcessor>[0]) => {
    vi.stubGlobal('MediaStream', class {});
    const ctx = new GraphContext();
    const processor = new MicProcessor(stages);
    return processor
      .init({ track: {}, audioContext: ctx } as never)
      .then(() => ({ ctx, processor }));
  };
  const kinds = (ctx: GraphContext, kind: string) => ctx.nodes.filter((n) => n.kind === kind);

  afterEach(() => vi.unstubAllGlobals());

  it('mixes to one channel before the output, which then has one channel too', async () => {
    const { ctx, processor } = await build({ mono: true, gate: null });
    const [source] = kinds(ctx, 'source');
    const [mix] = kinds(ctx, 'gain');
    const [output] = kinds(ctx, 'destination');
    expect(mix).toMatchObject({
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    expect(source.targets).toEqual(new Set([mix]));
    expect(mix.targets).toEqual(new Set([output]));
    expect(output.channelCount).toBe(1);

    await processor.destroy();
    expect(source.targets.size).toBe(0);
    expect(mix.targets.size).toBe(0);
  });

  it('feeds the gate from the mix, so the gate hears the mono signal', async () => {
    const { ctx, processor } = await build({
      mono: true,
      gate: () => ({ auto: false, threshold: 0.5, tuning: {} as never }),
    });
    const [source] = kinds(ctx, 'source');
    const [mix] = kinds(ctx, 'gain');
    expect(source.targets).toEqual(new Set([mix]));
    expect([...mix.targets].map((n) => n.kind).sort()).toEqual(['analyser', 'delay']);
    await processor.destroy();
  });

  it('leaves the capture at its own channel count without the mix', async () => {
    const { ctx, processor } = await build({
      mono: false,
      gate: () => ({ auto: false, threshold: 0.5, tuning: {} as never }),
    });
    const [source] = kinds(ctx, 'source');
    expect(kinds(ctx, 'destination')[0].channelCount).toBe(2);
    expect([...source.targets].map((n) => n.kind).sort()).toEqual(['analyser', 'delay']);
    await processor.destroy();
  });
});

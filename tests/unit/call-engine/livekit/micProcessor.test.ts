/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, of } from 'rxjs';
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

  state: AudioContextState = 'running';

  /** What `new AudioContext` was given, once the processor has made this context. */
  options: (AudioContextOptions & { sinkId?: unknown }) | undefined;

  private readonly listeners = new Set<() => void>();

  addEventListener(_type: 'error', listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'error', listener: () => void): void {
    this.listeners.delete(listener);
  }

  /** What Chromium does when the context's output device fails. */
  failOutput(): void {
    this.listeners.forEach((listener) => listener());
  }

  async resume(): Promise<void> {}

  close = vi.fn(async () => {
    this.state = 'closed';
  });

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

  audioWorklet = { addModule: vi.fn(async () => undefined) };

  /** The node an `AudioWorkletNode` made on this context stands for. */
  worklet(options: object): FakeNode {
    return this.node('gate', { options, port: { postMessage: vi.fn(), close: vi.fn() } });
  }
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

/** Makes `ctx` the audio context the next processor creates for itself. */
const useContext = (ctx: GraphContext): void => {
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor(options: AudioContextOptions) {
        ctx.options = options;
        return ctx;
      }
    }
  );
};

const stubGraphNodes = (): void => {
  vi.stubGlobal('MediaStream', class {});
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      constructor(ctx: GraphContext, name: string, options: object) {
        return Object.assign(ctx.worklet(options), { name });
      }
    }
  );
};

describe('the microphone graph', () => {
  const gateConfig = { auto: false, threshold: 0.5, tuning: {} as never };
  /** The context LiveKit hands a processor: it has no output device (patches/livekit-client). */
  const given = new GraphContext();
  const build = (stages: ConstructorParameters<typeof MicProcessor>[0]) => {
    stubGraphNodes();
    const ctx = new GraphContext();
    useContext(ctx);
    const processor = new MicProcessor(stages);
    return processor
      .init({ track: {}, audioContext: given } as never)
      .then(() => ({ ctx, processor }));
  };
  const kinds = (ctx: GraphContext, kind: string) => ctx.nodes.filter((n) => n.kind === kind);

  afterEach(() => vi.unstubAllGlobals());

  it('runs in a context of its own that a device clocks, not the one LiveKit hands it', async () => {
    const { ctx, processor } = await build({ mono: true, gate: of(gateConfig) });
    // a context without an output is rendered by a timer, which can run slow
    expect(ctx.options).toEqual({ latencyHint: 'interactive' });
    expect(ctx.nodes.length).toBeGreaterThan(0);
    expect(given.nodes).toHaveLength(0);
    expect(given.audioWorklet.addModule).not.toHaveBeenCalled();

    await processor.destroy();
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });

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
    expect(ctx.audioWorklet.addModule).not.toHaveBeenCalled();

    await processor.destroy();
    expect(source.targets.size).toBe(0);
    expect(mix.targets.size).toBe(0);
  });

  it('feeds the gate from the mix, so the gate hears the mono signal', async () => {
    const { ctx, processor } = await build({ mono: true, gate: of(gateConfig) });
    const [source] = kinds(ctx, 'source');
    const [mix] = kinds(ctx, 'gain');
    const [gate] = kinds(ctx, 'gate');
    const [output] = kinds(ctx, 'destination');
    expect(source.targets).toEqual(new Set([mix]));
    expect(mix.targets).toEqual(new Set([gate]));
    expect(gate.targets).toEqual(new Set([output]));
    await processor.destroy();
  });

  it('leaves the capture at its own channel count without the mix', async () => {
    const { ctx, processor } = await build({ mono: false, gate: of(gateConfig) });
    const [source] = kinds(ctx, 'source');
    const [gate] = kinds(ctx, 'gate');
    expect(kinds(ctx, 'destination')[0].channelCount).toBe(2);
    expect(source.targets).toEqual(new Set([gate]));
    await processor.destroy();
  });

  it('loads the gate worklet before it makes the gate, and passes the settings to it', async () => {
    const { ctx, processor } = await build({ mono: false, gate: of(gateConfig) });
    expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    const [gate] = kinds(ctx, 'gate');
    expect(gate.name).toBe('voice-gate');
    expect((gate.port as { postMessage: unknown }).postMessage).toHaveBeenCalledWith(gateConfig);
    await processor.destroy();
    expect(gate.targets.size).toBe(0);
    expect((gate.port as { close: unknown }).close).toHaveBeenCalled();
  });

  it('loads the worklet once per context, however often the graph is rebuilt', async () => {
    const { ctx, processor } = await build({ mono: false, gate: of(gateConfig) });
    // livekit-client restarts a processor without an audio context
    await processor.restart({ track: {} } as never);
    expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
    expect(kinds(ctx, 'gate')).toHaveLength(2);
    await processor.destroy();
  });

  it('builds no graph for a start that was destroyed while the worklet loaded', async () => {
    vi.stubGlobal('MediaStream', class {});
    const ctx = new GraphContext();
    useContext(ctx);
    let loaded!: () => void;
    ctx.audioWorklet.addModule = vi.fn(
      () => new Promise<undefined>((r) => (loaded = () => r(undefined)))
    );
    const processor = new MicProcessor({ mono: false, gate: of(gateConfig) });
    const starting = processor.init({ track: {}, audioContext: given } as never);
    await processor.destroy();
    loaded();
    await starting;
    expect(ctx.nodes).toHaveLength(0);
    expect(ctx.state).toBe('closed');
  });

  it('retries the worklet load after a failure', async () => {
    vi.stubGlobal('MediaStream', class {});
    const ctx = new GraphContext();
    useContext(ctx);
    ctx.audioWorklet.addModule = vi
      .fn<() => Promise<undefined>>()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValue(undefined);
    const processor = new MicProcessor({ mono: false, gate: of(gateConfig) });
    await expect(processor.init({ track: {}, audioContext: given } as never)).rejects.toThrow(
      'load failed'
    );
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        constructor(c: GraphContext, name: string, options: object) {
          return Object.assign(c.worklet(options), { name });
        }
      }
    );
    await processor.init({ track: {}, audioContext: given } as never);
    expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(2);
    expect(kinds(ctx, 'gate')).toHaveLength(1);
    await processor.destroy();
  });
});

describe("a microphone processor whose context's audio device fails", () => {
  // A microphone track that starts the processors it is given, as LiveKit does.
  const startingTrack = () => {
    let processor: MicProcessor | undefined;
    const track = {
      setProcessor: vi.fn(async (p: MicProcessor) => {
        await p.init({ track: {} } as never);
        processor = p;
      }),
      getProcessor: () => processor,
      stopProcessor: vi.fn(async () => {
        processor = undefined;
      }),
    };
    return track as typeof track & LocalAudioTrack;
  };

  let contexts: GraphContext[];
  beforeEach(() => {
    setMono(true);
    stubGraphNodes();
    contexts = [];
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          const ctx = new GraphContext();
          contexts.push(ctx);
          return ctx;
        }
      }
    );
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is replaced by one with a new context, so the microphone is not left silent', async () => {
    const track = startingTrack();
    micProcessingSync(scope, new BehaviorSubject<LocalAudioTrack | null>(track), logger);
    await settle();
    const first = track.getProcessor();
    expect(contexts).toHaveLength(1);

    contexts[0].failOutput();
    await settle();
    expect(track.setProcessor).toHaveBeenCalledTimes(2);
    expect(track.getProcessor()).not.toBe(first);
    expect(contexts).toHaveLength(2);
    expect(contexts[1].nodes.length).toBeGreaterThan(0);
  });

  it('is not replaced over and over while the device keeps failing', async () => {
    const track = startingTrack();
    micProcessingSync(scope, new BehaviorSubject<LocalAudioTrack | null>(track), logger);
    await settle();
    contexts[0].failOutput();
    await settle();
    contexts[1].failOutput();
    await settle();
    expect(track.setProcessor).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('is left alone once the microphone no longer uses it', async () => {
    const track = startingTrack();
    micProcessingSync(scope, new BehaviorSubject<LocalAudioTrack | null>(track), logger);
    await settle();
    setMono(false);
    await settle();
    contexts[0].failOutput();
    await settle();
    expect(track.setProcessor).toHaveBeenCalledTimes(1);
  });
});

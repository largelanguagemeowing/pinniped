// @vitest-environment jsdom
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createStore, Provider } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCallAudioContext } from '../../../src/app/features/call/stage/audio/callAudioContext';
import { callPlaybackAtom } from '../../../src/app/state/call';

// An audio context that records what it is asked to do; Chromium's sinkId/setSinkId included.
const { FakeContext } = vi.hoisted(() => {
  class Fake extends EventTarget {
    static made: Fake[] = [];

    state: AudioContextState = 'running';

    sinkId = '';

    sampleRate = 44100;

    baseLatency = 0.02;

    outputLatency = 0.05;

    /** Current Chromium's counters (seconds); absent in browsers from before them. */
    playbackStats:
      { underrunEvents: number; underrunDuration: number; totalDuration: number } | undefined =
      undefined;

    /** The origin trial's counters (milliseconds). */
    playoutStats:
      | {
          fallbackFramesEvents: number;
          fallbackFramesDuration: number;
          totalFramesDuration: number;
        }
      | undefined = {
      fallbackFramesEvents: 3,
      fallbackFramesDuration: 60,
      totalFramesDuration: 9000,
    };

    options: unknown;

    sinks: string[] = [];

    /** Output changes in progress, at most; Chromium stalls a starting context if they overlap. */
    active = 0;

    maxActive = 0;

    /** While set, `setSinkId` waits for it. */
    hold: Promise<void> | undefined;

    constructor(options?: unknown) {
      super();
      this.options = options;
      Fake.made.push(this);
    }

    /** What Chromium does when the output fails: it stops the context and fires `error`. */
    failOutput(): void {
      this.state = 'suspended';
      this.dispatchEvent(new Event('error'));
      this.dispatchEvent(new Event('statechange'));
    }

    async setSinkId(id: string): Promise<void> {
      this.sinks.push(id);
      this.active += 1;
      this.maxActive = Math.max(this.maxActive, this.active);
      await this.hold;
      this.active -= 1;
      this.sinkId = id;
      this.dispatchEvent(new Event('sinkchange'));
    }

    async close(): Promise<void> {
      this.become('closed');
    }

    become(state: AudioContextState): void {
      this.state = state;
      this.dispatchEvent(new Event('statechange'));
    }
  }
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = Fake;
  return { FakeContext: Fake };
});

const devices = new EventTarget();
Object.defineProperty(navigator, 'mediaDevices', { value: devices, configurable: true });

let current: AudioContext | undefined;
function CallAudio({ outputId }: { outputId: string }) {
  current = useCallAudioContext(outputId);
  return null;
}

const renderers: ReactTestRenderer[] = [];
const mount = (outputId: string) => {
  const store = createStore();
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <Provider store={store}>
        <CallAudio outputId={outputId} />
      </Provider>
    );
  });
  renderers.push(renderer);
  const rerender = (next: string) =>
    act(() =>
      renderer.update(
        <Provider store={store}>
          <CallAudio outputId={next} />
        </Provider>
      )
    );
  return { store, renderer, rerender };
};

const latest = () => FakeContext.made[FakeContext.made.length - 1];
const flush = () => act(async () => undefined);

beforeEach(() => {
  FakeContext.made = [];
});
afterEach(() => {
  renderers.splice(0).forEach((r) => act(() => r.unmount()));
});

describe("the call's audio context", () => {
  it('plays through one context on the chosen output', async () => {
    const { store } = mount('headphones');
    await flush();
    expect(FakeContext.made).toHaveLength(1);
    expect(current).toBe(latest());
    expect(latest().sinkId).toBe('headphones');
    expect(store.get(callPlaybackAtom)).toMatchObject({
      state: 'running',
      sinkId: 'headphones',
      failures: [],
      sampleRate: 44100,
    });
  });

  it('asks for the buffering that rides out a loaded machine, and reports its underruns', async () => {
    const { store } = mount('');
    await flush();
    expect(latest().options).toEqual({ latencyHint: 'playback' });
    expect(store.get(callPlaybackAtom)?.underruns()).toEqual({
      events: 3,
      seconds: 0.06,
      ofSeconds: 9,
    });
  });

  it("reads the underruns from current Chromium's playbackStats, which replaced playoutStats", async () => {
    const { store } = mount('');
    await flush();
    // Electron 45: playbackStats only.
    latest().playoutStats = undefined;
    latest().playbackStats = { underrunEvents: 2, underrunDuration: 0.03, totalDuration: 12 };
    expect(store.get(callPlaybackAtom)?.underruns()).toEqual({
      events: 2,
      seconds: 0.03,
      ofSeconds: 12,
    });
    latest().playbackStats = undefined;
    expect(store.get(callPlaybackAtom)?.underruns()).toBeUndefined();
  });

  it('plays on the system default when no output is chosen', async () => {
    mount('');
    await flush();
    expect(latest().sinks).toEqual([]);
  });

  it('changes the output one at a time, to the latest choice, while the context starts', async () => {
    // the output is '' until the device list is known, then the real default, then a choice
    const { rerender } = mount('');
    await flush();
    const ctx = latest();
    let release!: () => void;
    ctx.hold = new Promise((resolve) => {
      release = resolve;
    });
    rerender('default');
    await flush();
    expect(ctx.active).toBe(1);
    rerender('headphones');
    rerender('speakers');
    await flush();
    expect(ctx.sinks).toEqual(['default']);
    release();
    ctx.hold = undefined;
    await flush();
    expect(ctx.maxActive).toBe(1);
    expect(ctx.sinks).toEqual(['default', 'speakers']);
    expect(ctx.sinkId).toBe('speakers');
  });

  it('replaces the context, on the same output, when its output fails', async () => {
    const { store } = mount('headphones');
    await flush();
    const first = latest();
    act(() => first.failOutput());
    await flush();
    expect(FakeContext.made).toHaveLength(2);
    expect(first.state).toBe('closed');
    expect(current).toBe(latest());
    expect(latest().sinkId).toBe('headphones');
    expect(store.get(callPlaybackAtom)).toMatchObject({ state: 'running', sinkId: 'headphones' });
    expect(store.get(callPlaybackAtom)?.failures).toHaveLength(1);
  });

  it('keeps its context across device changes that leave its output working', async () => {
    mount('headphones');
    await flush();
    act(() => {
      devices.dispatchEvent(new Event('devicechange'));
    });
    await flush();
    expect(FakeContext.made).toHaveLength(1);
    expect(current).toBe(latest());
  });

  it('follows a newly chosen output without a new context', async () => {
    const { rerender } = mount('headphones');
    await flush();
    rerender('speakers');
    await flush();
    expect(FakeContext.made).toHaveLength(1);
    expect(latest().sinks).toEqual(['headphones', 'speakers']);
  });

  it('closes the context and stops listening once the call audio goes', async () => {
    const { store, renderer } = mount('headphones');
    await flush();
    const ctx = latest();
    act(() => renderer.unmount());
    renderers.splice(renderers.indexOf(renderer), 1);
    await flush();
    expect(ctx.state).toBe('closed');
    expect(store.get(callPlaybackAtom)).toBeUndefined();
    act(() => ctx.failOutput());
    await flush();
    expect(FakeContext.made).toHaveLength(1);
  });
});

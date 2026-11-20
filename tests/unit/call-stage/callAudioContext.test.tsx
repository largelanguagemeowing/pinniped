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

    sinks: string[] = [];

    constructor() {
      super();
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
    expect(store.get(callPlaybackAtom)).toEqual({
      state: 'running',
      sinkId: 'headphones',
      failures: [],
    });
  });

  it('plays on the system default when no output is chosen', async () => {
    mount('');
    await flush();
    expect(latest().sinks).toEqual(['']);
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

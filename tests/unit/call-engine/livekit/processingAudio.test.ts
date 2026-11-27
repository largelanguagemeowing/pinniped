/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudioAnalyser, type LocalAudioTrack, Room } from 'livekit-client';

import {
  processingAudioContext,
  sendingAudioContext,
} from '../../../../src/app/plugins/call/engine/livekit/processingAudioContext';
import { PcmAudioSource } from '../../../../src/app/plugins/call/engine/livekit/shareAudio';

// An audio context that records how it was made; just enough graph for LiveKit's analyser.
class RecordingContext {
  static made: RecordingContext[] = [];

  state: AudioContextState = 'running';

  constructor(public readonly options: AudioContextOptions & { sinkId?: unknown } = {}) {
    RecordingContext.made.push(this);
  }

  addEventListener(): void {}

  async resume(): Promise<void> {}

  async close(): Promise<void> {
    this.state = 'closed';
  }

  createAnalyser(): Partial<AnalyserNode> {
    return { fftSize: 2048, frequencyBinCount: 1024 };
  }

  createMediaStreamSource(): Partial<MediaStreamAudioSourceNode> {
    return { connect: ((node: AudioNode) => node) as MediaStreamAudioSourceNode['connect'] };
  }

  createMediaStreamDestination(): Partial<MediaStreamAudioDestinationNode> {
    return { channelCount: 2 };
  }

  audioWorklet = { addModule: async (): Promise<void> => undefined };
}

const opensOutput = (ctx: RecordingContext): boolean => ctx.options.sinkId === undefined;
const latest = (): RecordingContext => RecordingContext.made[RecordingContext.made.length - 1];

// LiveKit's room context is private, and made on connect.
const acquire = (room: Room): Promise<void> =>
  (room as unknown as { acquireAudioContext(): Promise<void> }).acquireAudioContext();

beforeEach(() => {
  RecordingContext.made = [];
  vi.stubGlobal('AudioContext', RecordingContext);
  vi.stubGlobal('MediaStream', class {});
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// A context without an output is rendered by a timer, which Chromium lets run slow (on Windows at
// 64 ticks a second, 0.64 s of audio a second): what such a context sends arrives cut up.
describe('audio contexts whose output is sent to the call, on Windows', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
  });

  it('are clocked by an output device, with the options they were given', () => {
    sendingAudioContext({ latencyHint: 'interactive' });
    expect(latest().options).toEqual({ latencyHint: 'interactive' });
    expect(opensOutput(latest())).toBe(true);
  });

  it('include the shared-screen audio the desktop app captures', async () => {
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        connect(): void {}
      }
    );
    await PcmAudioSource.create();
    expect(RecordingContext.made).toHaveLength(1);
    expect(latest().options).toEqual({ sampleRate: 48000, latencyHint: 'interactive' });
  });
});

// Elsewhere the timer is precise, and an output stream on the default device (a Bluetooth
// headset's, for one) is not wanted.
describe('audio contexts whose output is sent to the call, off Windows', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' });
  });

  it('open no output stream, with the options they were given', () => {
    sendingAudioContext({ latencyHint: 'interactive' });
    expect(latest().options).toEqual({ latencyHint: 'interactive', sinkId: { type: 'none' } });
    expect(opensOutput(latest())).toBe(false);
  });
});

describe('audio contexts that only measure audio', () => {
  it('open no output stream, with the options they were given', () => {
    processingAudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    expect(latest().options).toEqual({
      sampleRate: 48000,
      latencyHint: 'interactive',
      sinkId: { type: 'none' },
    });
  });

  // patches/livekit-client+2.19.0.patch
  it("include LiveKit's room context when the room does not mix remote audio itself", async () => {
    await acquire(new Room({ webAudioMix: false }));
    expect(RecordingContext.made).toHaveLength(1);
    expect(opensOutput(latest())).toBe(false);
  });

  it("leave LiveKit's room context an output when the room mixes remote audio", async () => {
    await acquire(new Room({ webAudioMix: true }));
    expect(RecordingContext.made).toHaveLength(1);
    expect(opensOutput(latest())).toBe(true);
  });

  it("include LiveKit's track analysers", () => {
    const track = { mediaStreamTrack: {} } as unknown as LocalAudioTrack;
    createAudioAnalyser(track).cleanup();
    expect(RecordingContext.made).toHaveLength(1);
    expect(opensOutput(latest())).toBe(false);
  });
});

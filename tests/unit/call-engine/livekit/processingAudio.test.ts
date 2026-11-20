/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudioAnalyser, type LocalAudioTrack, Room } from 'livekit-client';

import { processingAudioContext } from '../../../../src/app/plugins/call/engine/livekit/processingAudioContext';

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

describe('audio contexts that only process audio', () => {
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

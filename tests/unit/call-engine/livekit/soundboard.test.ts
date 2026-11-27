/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { type Room as LivekitRoom } from 'livekit-client';
import { logger } from 'matrix-js-sdk/lib/logger';

import {
  Soundboard,
  soundboardMonitorLevel,
} from '../../../../src/app/plugins/call/engine/livekit/soundboard';

describe('soundboardMonitorLevel', () => {
  it("is the user's soundboard volume, kept between 0 and 1", () => {
    expect(soundboardMonitorLevel(0.4, false)).toBe(0.4);
    expect(soundboardMonitorLevel(3, false)).toBe(1);
    expect(soundboardMonitorLevel(-1, false)).toBe(0);
  });

  it('is silent while deafened, whatever the volume', () => {
    expect(soundboardMonitorLevel(1, true)).toBe(0);
    expect(soundboardMonitorLevel(0.4, true)).toBe(0);
  });
});

// Audio nodes that record the graph they are wired into.
class Node {
  readonly outputs: Node[] = [];

  connect(target: Node): Node {
    this.outputs.push(target);
    return target;
  }

  disconnect(): void {
    this.outputs.length = 0;
  }
}

class Destination extends Node {
  private readonly track = { readyState: 'live' };

  readonly stream = { getAudioTracks: () => [this.track] };
}

class Context {
  static made: Context[] = [];

  readonly destination = new Node();

  readonly streams: Destination[] = [];

  readonly sources: Node[] = [];

  constructor(public readonly options: AudioContextOptions & { sinkId?: unknown } = {}) {
    Context.made.push(this);
  }

  async resume(): Promise<void> {}

  async close(): Promise<void> {}

  async decodeAudioData(): Promise<object> {
    return {};
  }

  createGain(): Node & { gain: { value: number } } {
    return Object.assign(new Node(), { gain: { value: 1 } });
  }

  createBufferSource(): Node {
    const source = Object.assign(new Node(), {
      start: () => undefined,
      stop: () => undefined,
      addEventListener: () => undefined,
    });
    this.sources.push(source);
    return source;
  }

  createMediaStreamDestination(): Destination {
    const destination = new Destination();
    this.streams.push(destination);
    return destination;
  }
}

const reaches = (from: Node, to: Node): boolean =>
  from === to || from.outputs.some((next) => reaches(next, to));

const room = () => {
  const published: unknown[] = [];
  const lk = {
    localParticipant: {
      publishTrack: async (track: unknown) => {
        published.push(track);
        return { track: { mediaStreamTrack: track } };
      },
      unpublishTrack: async () => undefined,
    },
  } as unknown as LivekitRoom;
  return { lk, published };
};

describe('the soundboard', () => {
  beforeEach(() => {
    Context.made = [];
    vi.stubGlobal('AudioContext', Context);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    vi.stubGlobal('fetch', async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends sounds to the call and the user's copy to the call's playback, and plays nothing itself", async () => {
    const monitor$ = new BehaviorSubject<MediaStream | null>(null);
    const { lk, published } = room();
    const soundboard = new Soundboard(lk, new BehaviorSubject(false), monitor$, logger);

    await soundboard.play('blob:sound');

    expect(Context.made).toHaveLength(1);
    const [ctx] = Context.made;
    // a device clocks it: a context without an output is rendered by a timer, which can run slow
    expect(ctx.options).toEqual({ latencyHint: 'interactive' });
    const [sent, copy] = ctx.streams;
    expect(published).toEqual([sent.stream.getAudioTracks()[0]]);
    expect(monitor$.value).toBe(copy.stream);
    const [sound] = ctx.sources;
    expect(reaches(sound, sent)).toBe(true);
    expect(reaches(sound, copy)).toBe(true);
    expect(reaches(sound, ctx.destination)).toBe(false);

    await soundboard.dispose();
    expect(monitor$.value).toBeNull();
  });

  it("leaves a newer soundboard's copy in place when it goes", async () => {
    const monitor$ = new BehaviorSubject<MediaStream | null>(null);
    const deafened$ = new BehaviorSubject(false);
    const older = new Soundboard(room().lk, deafened$, monitor$, logger);
    await older.play('blob:sound');
    const newer = new Soundboard(room().lk, deafened$, monitor$, logger);
    await newer.play('blob:sound');
    const newerCopy = monitor$.value;

    await older.dispose();
    expect(monitor$.value).toBe(newerCopy);
    await newer.dispose();
    expect(monitor$.value).toBeNull();
  });
});

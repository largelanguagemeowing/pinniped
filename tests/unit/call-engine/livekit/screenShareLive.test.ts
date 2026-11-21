/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalVideoTrack, type Room, Track } from 'livekit-client';

import {
  applyScreenShareContent,
  fitScreenShare,
  fitToBudget,
  screenShareConstraints,
} from '../../../../src/app/plugins/call/engine/livekit/screenShareLive';
import { type ScreenShareQuality } from '../../../../src/app/plugins/call/types';

const P1080 = { width: 1920, height: 1080 };
const pixels = (s: { width: number; height: number }): number => s.width * s.height;
const aspect = (s: { width: number; height: number }): number => s.width / s.height;

/** A display capture of a surface of `source`'s size, as Chromium reports it. */
class Capture {
  contentHint = '';

  applied: MediaTrackConstraints[] = [];

  // What LiveKit asks getDisplayMedia for: the 16:9 box of the quality.
  private constraints: MediaTrackConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: 30,
  };

  constructor(public source: { width: number; height: number } | undefined) {}

  getCapabilities(): MediaTrackCapabilities {
    return this.source
      ? { width: { min: 1, max: this.source.width }, height: { min: 1, max: this.source.height } }
      : {};
  }

  getConstraints(): MediaTrackConstraints {
    return this.constraints;
  }

  async applyConstraints(constraints: MediaTrackConstraints): Promise<void> {
    this.constraints = constraints;
    this.applied.push(constraints);
  }

  addEventListener(): void {}

  removeEventListener(): void {}
}

/** The sender's parameters, as the browser keeps them. */
class Sender {
  params = { encodings: [{}] } as RTCRtpSendParameters;

  getParameters(): RTCRtpSendParameters {
    return this.params;
  }

  async setParameters(params: RTCRtpSendParameters): Promise<void> {
    this.params = params;
  }

  async replaceTrack(): Promise<void> {}
}

const sharing = (capture: Capture, sender = new Sender()): Room => {
  const track = new LocalVideoTrack(capture as unknown as MediaStreamTrack);
  track.sender = sender as unknown as RTCRtpSender;
  return {
    localParticipant: {
      getTrackPublication: (source: Track.Source) =>
        source === Track.Source.ScreenShare ? { track } : undefined,
    },
  } as unknown as Room;
};

const q1080: ScreenShareQuality = { resolution: '1080p', fps: 30 };

beforeEach(() => {
  // LiveKit wraps a track in a stream of its own.
  vi.stubGlobal('MediaStream', class {});
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a screen share capture size', () => {
  it("gives an ultrawide screen a 16:9 screen's pixels, in its own shape", () => {
    const size = fitToBudget({ width: 3440, height: 1440 }, P1080);
    expect(pixels(size)).toBeLessThanOrEqual(pixels(P1080));
    expect(pixels(size)).toBeGreaterThan(pixels(P1080) * 0.99);
    expect(aspect(size)).toBeCloseTo(3440 / 1440, 1);
    // A 16:9 box would have made it 1920x804.
    expect(size.width).toBeGreaterThan(2200);
  });

  it('does not shrink a portrait window to the height of a landscape box', () => {
    expect(fitToBudget({ width: 1080, height: 1920 }, P1080)).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it('keeps a source smaller than the budget at its own size', () => {
    expect(fitToBudget({ width: 1001, height: 601 }, P1080)).toEqual({ width: 1001, height: 601 });
  });

  it('scales a larger 16:9 screen to the box, in even sizes', () => {
    const size = fitToBudget({ width: 3840, height: 2160 }, P1080);
    expect(size).toEqual({ width: 1920, height: 1080 });
    const odd = fitToBudget({ width: 2561, height: 1441 }, P1080);
    expect(odd.width % 2).toBe(0);
    expect(odd.height % 2).toBe(0);
  });

  it("is the quality's 16:9 box where the browser does not report the source", () => {
    const constraints = screenShareConstraints(new Capture(undefined) as never, q1080);
    expect(constraints).toEqual({
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    });
  });
});

describe('a running screen share', () => {
  it('is fitted to its source, and left alone while the source keeps its size', async () => {
    const capture = new Capture({ width: 3440, height: 1440 });
    const room = sharing(capture);

    await fitScreenShare(room, q1080);
    await fitScreenShare(room, q1080);

    expect(capture.applied).toHaveLength(1);
    const { width, height } = capture.applied[0] as {
      width: { ideal: number };
      height: { ideal: number };
    };
    expect(aspect({ width: width.ideal, height: height.ideal })).toBeCloseTo(3440 / 1440, 1);
  });

  it('follows its source when the shared window is resized', async () => {
    const capture = new Capture({ width: 1920, height: 1080 });
    const room = sharing(capture);
    await fitScreenShare(room, q1080);

    capture.source = { width: 1080, height: 1920 };
    await fitScreenShare(room, q1080);

    expect(capture.getConstraints()).toMatchObject({
      width: { ideal: 1080 },
      height: { ideal: 1920 },
    });
  });

  it('keeps its sharpness under load once set to text, its frame rate once set to motion', async () => {
    const capture = new Capture({ width: 1920, height: 1080 });
    const sender = new Sender();
    const room = sharing(capture, sender);

    await applyScreenShareContent(room, 'text');
    expect(capture.contentHint).toBe('text');
    expect(sender.params.degradationPreference).toBe('maintain-resolution');

    await applyScreenShareContent(room, 'motion');
    expect(capture.contentHint).toBe('motion');
    expect(sender.params.degradationPreference).toBe('maintain-framerate');
  });

  it('changes nothing without a share', async () => {
    const room = {
      localParticipant: { getTrackPublication: () => undefined },
    } as unknown as Room;
    await expect(fitScreenShare(room, q1080)).resolves.toBeUndefined();
    await expect(applyScreenShareContent(room, 'text')).resolves.toBeUndefined();
  });
});

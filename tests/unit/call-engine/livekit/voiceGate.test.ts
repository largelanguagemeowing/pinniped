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
  VoiceGateProcessor,
  voiceGateSync,
} from '../../../../src/app/plugins/call/engine/livekit/voiceGate';
import { ObservableScope } from '../../../../src/app/plugins/call/engine/state/ObservableScope';
import { appStore } from '../../../../src/app/state/appStore';
import { settingsAtom } from '../../../../src/app/state/settings';

const setGate = (on: boolean) =>
  appStore.set(settingsAtom, { ...appStore.get(settingsAtom), callVoiceGate: on });

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
  vi.restoreAllMocks();
});

describe('the voice gate setting', () => {
  it('gates the microphone while it is on', async () => {
    setGate(false);
    const track = micTrack();
    voiceGateSync(scope, new BehaviorSubject<LocalAudioTrack | null>(track), logger);
    await settle();
    expect(track.getProcessor()).toBeUndefined();

    setGate(true);
    await settle();
    expect(track.getProcessor()).toBeInstanceOf(VoiceGateProcessor);

    setGate(false);
    await settle();
    expect(track.getProcessor()).toBeUndefined();
  });

  it('frees the gate of a microphone track that was replaced', async () => {
    setGate(true);
    const first = micTrack();
    const track$ = new BehaviorSubject<LocalAudioTrack | null>(first);
    voiceGateSync(scope, track$, logger);
    await settle();

    const second = micTrack();
    track$.next(second);
    await settle();
    expect(first.stopProcessor).toHaveBeenCalled();
    expect(second.getProcessor()).toBeInstanceOf(VoiceGateProcessor);
  });
});

describe('a voice gate that fails to start', () => {
  beforeEach(() => setGate(true));

  it('is freed when the track did not take it', async () => {
    const destroy = vi.spyOn(VoiceGateProcessor.prototype, 'destroy');
    voiceGateSync(scope, new BehaviorSubject(failingTrack(false)), logger);
    await settle();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('is left to the track that took it', async () => {
    const destroy = vi.spyOn(VoiceGateProcessor.prototype, 'destroy');
    voiceGateSync(scope, new BehaviorSubject(failingTrack(true)), logger);
    await settle();
    expect(destroy).not.toHaveBeenCalled();
  });
});

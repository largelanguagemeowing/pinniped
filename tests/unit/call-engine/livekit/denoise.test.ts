/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { type LocalAudioTrack } from 'livekit-client';
import { logger } from 'matrix-js-sdk/lib/logger';

import { denoiseSync } from '../../../../src/app/plugins/call/engine/livekit/denoise';
import { VoiceGateProcessor } from '../../../../src/app/plugins/call/engine/livekit/voiceGate';
import { ObservableScope } from '../../../../src/app/plugins/call/engine/state/ObservableScope';
import { appStore } from '../../../../src/app/state/appStore';
import { settingsAtom } from '../../../../src/app/state/settings';

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

describe('microphone processing that fails to start', () => {
  let scope: ObservableScope;
  beforeEach(() => {
    scope = new ObservableScope();
    appStore.set(settingsAtom, { ...appStore.get(settingsAtom), callVoiceGate: true });
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    scope.end();
    vi.restoreAllMocks();
  });

  it('is freed, audio context included, when the track did not take it', async () => {
    const destroy = vi.spyOn(VoiceGateProcessor.prototype, 'destroy');
    denoiseSync(scope, new BehaviorSubject(failingTrack(false)), logger);
    await settle();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('is left to the track that took it', async () => {
    const destroy = vi.spyOn(VoiceGateProcessor.prototype, 'destroy');
    denoiseSync(scope, new BehaviorSubject(failingTrack(true)), logger);
    await settle();
    expect(destroy).not.toHaveBeenCalled();
  });
});

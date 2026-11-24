/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { type Observable } from 'rxjs';

import { VOICE_GATE_PROCESSOR, type VoiceGateConfig } from './voiceGateDsp';
import voiceGateModuleUrl from './voiceGateWorklet?worker&url';

export type { VoiceGateConfig };

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

/** Loads the gate's worklet into `ctx`, once; required before {@link attachVoiceGate}. */
export function loadVoiceGate(ctx: BaseAudioContext): Promise<void> {
  let module = loaded.get(ctx);
  if (module === undefined) {
    module = ctx.audioWorklet.addModule(voiceGateModuleUrl);
    // A failed load is tried again by the next caller.
    module.catch(() => loaded.delete(ctx));
    loaded.set(ctx, module);
  }
  return module;
}

/**
 * Sends `input` to `output` only while it carries speech (see VoiceGateDsp). The gate runs on
 * the audio thread, in step with the samples, so it does not depend on timers; the main thread
 * only passes settings in. Always stereo: a mono input is heard on both sides, and a mono output
 * takes the mix. Returns the function that takes the stage apart.
 */
export function attachVoiceGate(
  ctx: BaseAudioContext,
  input: AudioNode,
  output: AudioNode,
  config$: Observable<VoiceGateConfig>
): () => void {
  const node = new AudioWorkletNode(ctx, VOICE_GATE_PROCESSOR, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
  });
  const subscription = config$.subscribe((config) => node.port.postMessage(config));
  input.connect(node);
  node.connect(output);
  return (): void => {
    subscription.unsubscribe();
    input.disconnect(node);
    node.disconnect();
    node.port.close();
  };
}

/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

// The voice gate's AudioWorklet module (see voiceGate.ts); bundled on its own.
import { VOICE_GATE_PROCESSOR, VoiceGateDsp, type VoiceGateConfig } from './voiceGateDsp';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  public readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

class VoiceGateProcessor extends AudioWorkletProcessor {
  private readonly dsp = new VoiceGateDsp(sampleRate);

  public constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<VoiceGateConfig>): void => this.dsp.configure(e.data);
  }

  public process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const [output] = outputs;
    if (output.length < 2) return true;
    this.dsp.process(inputs[0], [output[0], output[1]]);
    return true;
  }
}

registerProcessor(VOICE_GATE_PROCESSOR, VoiceGateProcessor);

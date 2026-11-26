/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { sendingAudioContext } from './processingAudioContext';

/**
 * Sample rate of the screen share audio Pinniped's desktop app captures itself (the `pcm` source;
 * Windows), pushed in with `CallViewModel.pushShareAudio` as interleaved stereo signed 16-bit
 * little-endian PCM.
 */
export const SHARE_AUDIO_RATE = 48000;

/** Splits interleaved 16-bit PCM into left and right channels of floats in [-1, 1). */
export function decodePcm16(pcm: Uint8Array): [Float32Array, Float32Array] {
  const frames = Math.floor(pcm.byteLength / 4);
  const view = new DataView(pcm.buffer, pcm.byteOffset, frames * 4);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    left[i] = view.getInt16(i * 4, true) / 32768;
    right[i] = view.getInt16(i * 4 + 2, true) / 32768;
  }
  return [left, right];
}

// Plays the chunks it is sent. It starts after a short lead so small delays between chunks do not
// crackle, plays silence when it runs dry, and drops the oldest audio past a cap, so the delay
// cannot grow when the two clocks drift.
const WORKLET = `
const LEAD = 3840;   // 80 ms: covers a late chunk on the way from the helper
const CAP = 14400;   // 300 ms
class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.left = [];
    this.right = [];
    this.queued = 0;
    this.playing = false;
    this.port.onmessage = (e) => {
      this.left.push(e.data[0]);
      this.right.push(e.data[1]);
      this.queued += e.data[0].length;
      while (this.queued > CAP) {
        this.queued -= this.left[0].length - this.offset;
        this.left.shift();
        this.right.shift();
        this.offset = 0;
      }
    };
    this.offset = 0;
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    const n = out[0].length;
    if (!this.playing && this.queued >= LEAD) this.playing = true;
    if (!this.playing) return true;
    for (let i = 0; i < n; i++) {
      if (this.queued === 0) { this.playing = false; break; }
      out[0][i] = this.left[0][this.offset];
      if (out[1]) out[1][i] = this.right[0][this.offset];
      this.offset++;
      this.queued--;
      if (this.offset >= this.left[0].length) {
        this.left.shift();
        this.right.shift();
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-player", PcmPlayer);
`;

/** An audio track that plays what `push` is given; publish `track` as the share's audio. */
export class PcmAudioSource {
  public static async create(): Promise<PcmAudioSource> {
    const ctx = sendingAudioContext({
      sampleRate: SHARE_AUDIO_RATE,
      latencyHint: 'interactive',
    });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(ctx, 'pcm-player', {
      numberOfInputs: 0,
      outputChannelCount: [2],
    });
    const destination = ctx.createMediaStreamDestination();
    destination.channelCount = 2;
    node.connect(destination);
    return new PcmAudioSource(ctx, node, destination);
  }

  private constructor(
    private readonly ctx: AudioContext,
    private readonly node: AudioWorkletNode,
    private readonly destination: MediaStreamAudioDestinationNode
  ) {}

  public get track(): MediaStreamTrack {
    return this.destination.stream.getAudioTracks()[0];
  }

  public push(pcm: Uint8Array): void {
    const [left, right] = decodePcm16(pcm);
    if (left.length > 0) this.node.port.postMessage([left, right], [left.buffer, right.buffer]);
  }

  public async close(): Promise<void> {
    this.node.disconnect();
    await this.ctx.close();
  }
}

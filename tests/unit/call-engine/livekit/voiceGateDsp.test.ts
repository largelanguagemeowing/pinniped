/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it, vi } from 'vitest';

import {
  VOICE_GATE_PROCESSOR,
  VoiceGateDsp,
  type VoiceGateConfig,
} from '../../../../src/app/plugins/call/engine/livekit/voiceGateDsp';
import { defaultVoiceTuning } from '../../../../src/app/plugins/call/voiceTuning';

const RATE = 48000;
const LOOKAHEAD = Math.round((defaultVoiceTuning.lookaheadMs / 1000) * RATE);

const config = (over: Partial<VoiceGateConfig> = {}): VoiceGateConfig => ({
  auto: false,
  threshold: 0.5,
  tuning: defaultVoiceTuning,
  ...over,
});

const seconds = (s: number): number => Math.round(s * RATE);

/**
 * A 210 Hz tone of `amplitude` for `from` to `to` seconds over a faint hum that never opens the
 * gate. The tone's period does not divide the lookahead, so a missing delay shows.
 */
function tone(total: number, bursts: [number, number][], amplitude = 0.5, phase = 0): Float32Array {
  const out = new Float32Array(seconds(total));
  for (let i = 0; i < out.length; i++) out[i] = 0.0005 * Math.sin(i * 0.37);
  for (const [from, to] of bursts) {
    for (let i = seconds(from); i < seconds(to); i++) {
      out[i] += amplitude * Math.sin((2 * Math.PI * 210 * (i - seconds(from))) / RATE + phase);
    }
  }
  return out;
}

/** Runs the input through a gate in blocks of `block` frames; mono in, the left channel out. */
function run(input: Float32Array, cfg: VoiceGateConfig, block = 128): Float32Array {
  const dsp = new VoiceGateDsp(RATE);
  dsp.configure(cfg);
  const out = new Float32Array(input.length);
  for (let at = 0; at < input.length; at += block) {
    const end = Math.min(input.length, at + block);
    const left = new Float32Array(end - at);
    const right = new Float32Array(end - at);
    dsp.process([input.subarray(at, end)], [left, right]);
    out.set(left, at);
  }
  return out;
}

const rms = (x: Float32Array): number => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

describe('the voice gate in the audio thread', () => {
  it('registers its processor under the name the main thread loads', () => {
    expect(VOICE_GATE_PROCESSOR).toBe('voice-gate');
  });

  it('sends exact silence while nothing loud is heard', () => {
    const hum = tone(1, []);
    expect(run(hum, config()).every((v) => v === 0)).toBe(true);
  });

  it('sends nothing before it is configured', () => {
    const dsp = new VoiceGateDsp(RATE);
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    dsp.process([tone(1, [[0, 1]]).subarray(0, 128)], [left, right]);
    expect(left.every((v) => v === 0)).toBe(true);
  });

  it('passes speech at full level, delayed by the lookahead, and closes to silence after it', () => {
    const input = tone(4, [[0.505, 1.505]]);
    const out = run(input, config());

    // Well into the speech: the input, unchanged, one lookahead late.
    for (let i = seconds(0.9); i < seconds(1.4); i += 997) {
      expect(out[i]).toBeCloseTo(input[i - LOOKAHEAD], 3);
    }
    // Hold and fade have run out: digital silence again.
    expect(out.subarray(seconds(3.3)).every((v) => v === 0)).toBe(true);
  });

  it('is at full level within 100 ms of the first sound', () => {
    const input = tone(2, [[0.505, 1.505]]);
    const out = run(input, config());
    const at = seconds(0.6);
    const heard = rms(out.subarray(at, at + 4096));
    expect(heard / rms(input.subarray(at - LOOKAHEAD, at - LOOKAHEAD + 4096))).toBeGreaterThan(
      0.99
    );
  });

  it('fades speech in instead of cutting in, when it starts at full level', () => {
    const onset = seconds(0.505);
    const input = tone(2, [[0.505, 1.505]], 0.5, Math.PI / 2);
    const out = run(input, config());
    expect(Math.abs(out[onset + LOOKAHEAD])).toBeLessThan(0.9 * Math.abs(input[onset]));
  });

  it('does not click: no step between samples beyond the tone itself', () => {
    const out = run(tone(4, [[0.505, 1.505]]), config());
    let step = 0;
    for (let i = 1; i < out.length; i++) step = Math.max(step, Math.abs(out[i] - out[i - 1]));
    // The tone alone moves 0.5 * 2*pi*210/48000 = 0.014 per sample.
    expect(step).toBeLessThan(0.02);
  });

  it('keeps the gate open across a pause shorter than the hold', () => {
    const input = tone(3, [
      [0.505, 1],
      [1.15, 1.7],
    ]);
    const out = run(input, config());
    for (let i = seconds(1.15) + 100; i < seconds(1.15) + 400; i += 100) {
      expect(out[i + LOOKAHEAD]).toBeCloseTo(input[i], 3);
    }
  });

  it('renders the same samples however they are cut into blocks', () => {
    const input = tone(2.5, [[0.3, 1.1]]);
    const reference = run(input, config(), 128);
    for (const block of [1, 64, 333, 4096]) {
      expect(run(input, config(), block)).toEqual(reference);
    }
  });

  it('follows the sensitivity setting', () => {
    const faint = tone(1.5, [[0.2, 1.2]], 0.05);
    expect(rms(run(faint, config({ threshold: 0.5 })))).toBeGreaterThan(0.01);
    expect(rms(run(faint, config({ threshold: 1 })))).toBe(0);
  });

  it('opens in automatic mode on speech after steady background noise', () => {
    const input = tone(4, [[1.5, 3]], 0.3);
    for (let i = 0; i < input.length; i++) input[i] += 0.002 * Math.sin(i * 0.9);
    const out = run(input, config({ auto: true }));
    expect(rms(out.subarray(seconds(0.5), seconds(1.2)))).toBe(0);
    expect(rms(out.subarray(seconds(2), seconds(2.5)))).toBeGreaterThan(0.1);
  });

  it('plays a mono input on both sides, and a missing input as silence', () => {
    const dsp = new VoiceGateDsp(RATE);
    dsp.configure(config());
    const input = tone(1, [[0, 1]]);
    let left = new Float32Array(0);
    let right = new Float32Array(0);
    for (let at = 0; at < seconds(0.5); at += 128) {
      left = new Float32Array(128);
      right = new Float32Array(128);
      dsp.process([input.subarray(at, at + 128)], [left, right]);
    }
    expect(right).toEqual(left);
    expect(left.some((v) => v !== 0)).toBe(true);

    left = new Float32Array(128).fill(1);
    right = new Float32Array(128).fill(1);
    expect(() => dsp.process([], [left, right])).not.toThrow();
  });
});

describe('the gate worklet module', () => {
  it('registers a processor that takes settings from its port and renders stereo', async () => {
    const registered: Record<
      string,
      new () => {
        port: { onmessage?: (e: unknown) => void };
        process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
      }
    > = {};
    vi.stubGlobal('sampleRate', RATE);
    vi.stubGlobal(
      'AudioWorkletProcessor',
      class {
        port: { onmessage?: (e: unknown) => void } = {};
      }
    );
    vi.stubGlobal('registerProcessor', (name: string, cls: (typeof registered)[string]) => {
      registered[name] = cls;
    });
    try {
      await import('../../../../src/app/plugins/call/engine/livekit/voiceGateWorklet');
      const Processor = registered[VOICE_GATE_PROCESSOR];
      expect(Processor).toBeDefined();
      const processor = new Processor();
      processor.port.onmessage?.({ data: config() });

      const input = tone(1, [[0, 1]]);
      let left = new Float32Array(128);
      let right = new Float32Array(128);
      for (let at = 0; at < seconds(0.5); at += 128) {
        left = new Float32Array(128);
        right = new Float32Array(128);
        expect(processor.process([[input.subarray(at, at + 128)]], [[left, right]])).toBe(true);
      }
      expect(left.some((v) => v !== 0)).toBe(true);
      // An output without channels is left alone, and the processor stays alive.
      expect(processor.process([[]], [[]])).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

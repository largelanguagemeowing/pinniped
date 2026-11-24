/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { expect, test } from 'vitest';

import {
  AdaptiveVoiceGate,
  VoiceGate,
  voiceGateLevels,
} from '../../../../src/app/plugins/call/engine/livekit/voiceGateLogic';

const gate = (): VoiceGate => new VoiceGate(0.01, 0.005, 200);

test('opens immediately on a loud sample and stays quiet below the open level', () => {
  const g = gate();
  expect(g.update(0.009, 0)).toBe(false);
  expect(g.update(0.02, 40)).toBe(true);
});

test('holds through short gaps, then closes once the hold has passed', () => {
  const g = gate();
  g.update(0.05, 0);
  expect(g.update(0, 100)).toBe(true);
  expect(g.update(0, 200)).toBe(true);
  expect(g.update(0, 240)).toBe(false);
});

test('a level between close and open keeps a speaker open but does not open the gate', () => {
  const g = gate();
  expect(g.update(0.007, 0)).toBe(false);
  g.update(0.05, 40);
  expect(g.update(0.007, 200)).toBe(true);
  expect(g.update(0.007, 380)).toBe(true); // still refreshes the hold
  expect(g.update(0.001, 700)).toBe(false);
});

test('the gate threshold maps to a rising open level, with a lower close level', () => {
  const low = voiceGateLevels(0);
  const mid = voiceGateLevels(0.5);
  const high = voiceGateLevels(1);
  expect(low.open).toBeLessThan(mid.open);
  expect(mid.open).toBeLessThan(high.open);
  expect(high.open).toBeCloseTo(0.1, 3); // -20 dBFS
  expect(mid.close).toBeLessThan(mid.open);
  expect(voiceGateLevels(5).open).toBe(high.open);
});

test('levels can be retuned while the gate runs', () => {
  const g = gate();
  expect(g.update(0.02, 0)).toBe(true);
  g.setLevels(0.5, 0.3);
  expect(g.update(0.02, 1000)).toBe(false);
});

const feed = (
  g: { update: (l: number, n: number) => boolean },
  db: number,
  fromMs: number,
  toMs: number
): boolean => {
  let on = false;
  for (let t = fromMs; t <= toMs; t += 20) on = g.update(10 ** (db / 20), t);
  return on;
};

test('the adaptive gate ignores steady room noise and opens for speech above it', () => {
  const g = new AdaptiveVoiceGate(200);
  expect(feed(g, -55, 0, 2000)).toBe(false);
  expect(feed(g, -30, 2020, 2400)).toBe(true);
  expect(feed(g, -55, 2420, 3000)).toBe(false);
});

test('the adaptive gate learns a louder room instead of staying open', () => {
  const g = new AdaptiveVoiceGate(200);
  feed(g, -55, 0, 2000);
  // A fan comes on at -40 dB: it opens at first, then the floor catches up and it closes.
  expect(feed(g, -40, 2020, 2200)).toBe(true);
  expect(feed(g, -40, 2220, 30000)).toBe(false);
});

test('the adaptive gate stays open through speech with its natural pauses', () => {
  const g = new AdaptiveVoiceGate(300);
  feed(g, -60, 0, 2000);
  let t = 2020;
  let open = true;
  for (let word = 0; word < 40; word += 1) {
    open = feed(g, -25, t, t + 1500) && open; // a phrase
    t += 1520;
    open = feed(g, -58, t, t + 200) && open; // a short pause, bridged by the hold
    t += 220;
  }
  expect(open).toBe(true);
});

test('the fixed gate closes 6 dB below its open level', () => {
  const { open, close } = voiceGateLevels(0.5);
  expect(20 * Math.log10(open / close)).toBeCloseTo(6, 5);
  const g = new VoiceGate(open, close, 100);
  expect(g.update(open * 1.01, 0)).toBe(true);
  // Dips below the open level but not below the close level do not let go of it.
  expect(g.update(open * 0.6, 500)).toBe(true);
  expect(g.update(close * 0.9, 900)).toBe(false);
  // And from closed, a level between close and open does not reopen it.
  expect(g.update(open * 0.8, 1000)).toBe(false);
});

/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { decodePcm16 } from "./shareAudio";

describe("decodePcm16", () => {
  it("splits interleaved little-endian samples into channels", () => {
    // L 0, R -32768, L 16384, R 32767
    const pcm = new Uint8Array([0, 0, 0, 0x80, 0, 0x40, 0xff, 0x7f]);
    const [left, right] = decodePcm16(pcm);
    expect(Array.from(left)).toEqual([0, 0.5]);
    expect(right[0]).toBe(-1);
    expect(right[1]).toBeCloseTo(0.99997, 4);
  });

  it("ignores a trailing partial frame and honours the byte offset", () => {
    const backing = new Uint8Array([9, 9, 0, 0x40, 0, 0x40, 1, 2, 3]);
    const [left, right] = decodePcm16(backing.subarray(2, 9));
    expect(left.length).toBe(1);
    expect(left[0]).toBe(0.5);
    expect(right[0]).toBe(0.5);
  });
});

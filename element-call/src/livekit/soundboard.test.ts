/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, it } from "vitest";

import { soundboardMonitorLevel } from "./soundboard";

describe("soundboardMonitorLevel", () => {
  it("is the user's soundboard volume, kept between 0 and 1", () => {
    expect(soundboardMonitorLevel(0.4, false)).toBe(0.4);
    expect(soundboardMonitorLevel(3, false)).toBe(1);
    expect(soundboardMonitorLevel(-1, false)).toBe(0);
  });

  it("is silent while deafened, whatever the volume", () => {
    expect(soundboardMonitorLevel(1, true)).toBe(0);
    expect(soundboardMonitorLevel(0.4, true)).toBe(0);
  });
});

/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { describe, expect, test } from "vitest";

import { resolveKeyMemberId } from "./keyMessages";

const sky = {
  userId: "@sky:example.org",
  deviceId: "DEV",
  memberId: "@sky:example.org:DEV",
};
const content = (id?: string, device = "DEV"): never =>
  ({ member: { id, claimed_device_id: device } }) as never;

describe("resolveKeyMemberId", () => {
  test("leaves a key that already matches", () => {
    expect(resolveKeyMemberId(sky.userId, content(sky.memberId), [sky])).toBe(
      undefined,
    );
    expect(
      resolveKeyMemberId(
        sky.userId,
        { member_id: sky.memberId, member: { claimed_device_id: "DEV" } },
        [sky],
      ),
    ).toBe(undefined);
  });

  test("uses the only membership on that device when the ID is unknown", () => {
    expect(resolveKeyMemberId(sky.userId, content("random-uuid"), [sky])).toBe(
      sky.memberId,
    );
    expect(resolveKeyMemberId(sky.userId, content(undefined), [sky])).toBe(
      sky.memberId,
    );
  });

  test("does nothing without exactly one membership to adopt", () => {
    const other = { ...sky, memberId: "second" };
    expect(
      resolveKeyMemberId(sky.userId, content("random-uuid"), [sky, other]),
    ).toBe(undefined);
    expect(resolveKeyMemberId(sky.userId, content("random-uuid"), [])).toBe(
      undefined,
    );
  });

  test("never adopts a membership of another user or device", () => {
    expect(
      resolveKeyMemberId("@mallory:example.org", content("x"), [sky]),
    ).toBe(undefined);
    expect(resolveKeyMemberId(sky.userId, content("x", "OTHER"), [sky])).toBe(
      undefined,
    );
  });

  test("ignores a key without a claimed device", () => {
    expect(resolveKeyMemberId(sky.userId, {} as never, [sky])).toBe(undefined);
  });
});

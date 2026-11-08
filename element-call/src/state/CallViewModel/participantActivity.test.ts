/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  type ActivityScreenShare,
  type ActivityUserMedia,
  type ParticipantActivity,
  observeParticipantActivity$,
} from "./participantActivity";

interface TestMedia {
  userId: string;
  speaking$: BehaviorSubject<boolean>;
  audioEnabled$: BehaviorSubject<boolean>;
  value: ActivityUserMedia;
}

function media(
  userId: string,
  speaking = false,
  audioEnabled = true,
): TestMedia {
  const speaking$ = new BehaviorSubject(speaking);
  const audioEnabled$ = new BehaviorSubject(audioEnabled);
  const deafened$ = new BehaviorSubject(false);
  return {
    userId,
    speaking$,
    audioEnabled$,
    value: { userId, speaking$, audioEnabled$, deafened$ } as ActivityUserMedia,
  };
}

function setup(initial: TestMedia[]): {
  userMedia$: BehaviorSubject<ActivityUserMedia[]>;
  screenShares$: BehaviorSubject<ActivityScreenShare[]>;
  snapshots: ParticipantActivity[];
  ids: (set: ReadonlySet<string>) => string[];
} {
  const userMedia$ = new BehaviorSubject(initial.map((m) => m.value));
  const screenShares$ = new BehaviorSubject<ActivityScreenShare[]>([]);
  const snapshots: ParticipantActivity[] = [];
  observeParticipantActivity$(userMedia$, screenShares$).subscribe((a) =>
    snapshots.push(a),
  );
  const ids = (set: ReadonlySet<string>): string[] => [...set].sort();
  return { userMedia$, screenShares$, snapshots, ids };
}

describe("observeParticipantActivity$", () => {
  it("reports speakers, muted users and screen sharers from the participants", () => {
    const alice = media("@alice:hs", true);
    const bob = media("@bob:hs", false, false);
    const { screenShares$, snapshots, ids } = setup([alice, bob]);
    screenShares$.next([{ userId: "@bob:hs" }]);

    const latest = snapshots[snapshots.length - 1];
    expect(ids(latest.speaking)).toEqual(["@alice:hs"]);
    expect(ids(latest.muted)).toEqual(["@bob:hs"]);
    expect(ids(latest.screenSharing)).toEqual(["@bob:hs"]);
  });

  it("follows speaking and mute changes", () => {
    const alice = media("@alice:hs");
    const { snapshots, ids } = setup([alice]);
    alice.speaking$.next(true);
    expect(ids(snapshots[snapshots.length - 1].speaking)).toEqual([
      "@alice:hs",
    ]);
    alice.speaking$.next(false);
    alice.audioEnabled$.next(false);
    const latest = snapshots[snapshots.length - 1];
    expect(ids(latest.speaking)).toEqual([]);
    expect(ids(latest.muted)).toEqual(["@alice:hs"]);
  });

  it("does not emit the same snapshot twice", () => {
    const alice = media("@alice:hs");
    const { snapshots } = setup([alice]);
    const before = snapshots.length;
    alice.speaking$.next(false);
    alice.audioEnabled$.next(true);
    expect(snapshots.length).toBe(before);
  });

  it("picks up participants who join and drops those who leave", () => {
    const alice = media("@alice:hs", true);
    const { userMedia$, snapshots, ids } = setup([alice]);
    const bob = media("@bob:hs", true);
    userMedia$.next([alice.value, bob.value]);
    expect(ids(snapshots[snapshots.length - 1].speaking)).toEqual([
      "@alice:hs",
      "@bob:hs",
    ]);
    userMedia$.next([bob.value]);
    expect(ids(snapshots[snapshots.length - 1].speaking)).toEqual(["@bob:hs"]);
    userMedia$.next([]);
    expect(ids(snapshots[snapshots.length - 1].speaking)).toEqual([]);
  });

  it("treats a user on several devices as speaking if any speaks, muted if none sends audio", () => {
    const phone = media("@alice:hs", false, false);
    const desktop = media("@alice:hs", true, true);
    const { snapshots, ids } = setup([phone, desktop]);
    let latest = snapshots[snapshots.length - 1];
    expect(ids(latest.speaking)).toEqual(["@alice:hs"]);
    expect(ids(latest.muted)).toEqual([]);
    desktop.audioEnabled$.next(false);
    latest = snapshots[snapshots.length - 1];
    expect(ids(latest.muted)).toEqual(["@alice:hs"]);
  });

  it("emits an empty snapshot for an empty call", () => {
    const { snapshots } = setup([]);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].speaking.size).toBe(0);
  });
});

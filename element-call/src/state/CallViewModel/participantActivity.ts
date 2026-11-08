/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Observable,
  combineLatest,
  distinctUntilChanged,
  map,
  of,
  switchMap,
} from "rxjs";

import { type Behavior } from "../Behavior";

/**
 * Who in the call is speaking, has their microphone off, or is sharing their
 * screen, as Matrix user IDs. This is what an embedding client shows next to
 * the participants; it comes from the call's data, so it does not depend on
 * which tiles the layout happens to have on screen.
 */
export interface ParticipantActivity {
  /** At least one of the user's devices is speaking. */
  speaking: ReadonlySet<string>;
  /** At least one of the user's devices reports itself deafened (client-reported, not enforced). */
  deafened: ReadonlySet<string>;
  /** None of the user's devices is sending audio. */
  muted: ReadonlySet<string>;
  screenSharing: ReadonlySet<string>;
}

/** Nobody speaking, muted or sharing: what to show until participants report. */
export const emptyParticipantActivity: ParticipantActivity = {
  speaking: new Set(),
  deafened: new Set(),
  muted: new Set(),
  screenSharing: new Set(),
};

/** The part of a participant's media this needs. */
export interface ActivityUserMedia {
  userId: string;
  speaking$: Behavior<boolean>;
  audioEnabled$: Behavior<boolean>;
  deafened$: Behavior<boolean>;
}

export interface ActivityScreenShare {
  userId: string;
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size === b.size && [...a].every((id) => b.has(id));

export const sameActivity = (
  a: ParticipantActivity,
  b: ParticipantActivity,
): boolean =>
  sameSet(a.speaking, b.speaking) &&
  sameSet(a.deafened, b.deafened) &&
  sameSet(a.muted, b.muted) &&
  sameSet(a.screenSharing, b.screenSharing);

/**
 * Emits a new snapshot whenever someone starts or stops speaking, mutes or
 * unmutes, starts or stops sharing, or joins or leaves; never the same one twice.
 * A user can be in the call from several devices: they count as speaking when
 * any device speaks and as muted when no device sends audio.
 */
export function observeParticipantActivity$(
  userMedia$: Behavior<ActivityUserMedia[]>,
  screenShares$: Behavior<ActivityScreenShare[]>,
): Observable<ParticipantActivity> {
  const media$ = userMedia$.pipe(
    switchMap((list) =>
      list.length === 0
        ? of([])
        : combineLatest(
            list.map((m) =>
              combineLatest([m.speaking$, m.audioEnabled$, m.deafened$]).pipe(
                map(([speaking, audioEnabled, deafened]) => ({
                  userId: m.userId,
                  speaking,
                  audioEnabled,
                  deafened,
                })),
              ),
            ),
          ),
    ),
  );

  return combineLatest([media$, screenShares$]).pipe(
    map(([media, screenShares]) => {
      const users = new Set(media.map((m) => m.userId));
      return {
        speaking: new Set(media.filter((m) => m.speaking).map((m) => m.userId)),
        deafened: new Set(media.filter((m) => m.deafened).map((m) => m.userId)),
        muted: new Set(
          [...users].filter((id) =>
            media.every((m) => m.userId !== id || !m.audioEnabled),
          ),
        ),
        screenSharing: new Set(screenShares.map((s) => s.userId)),
      };
    }),
    distinctUntilChanged(sameActivity),
  );
}

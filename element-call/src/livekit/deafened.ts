/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { BehaviorSubject } from "rxjs";

import { setAudioEnabled$ } from "../controls";

/**
 * The LiveKit participant attribute that says whether a client is deafened (its output is off).
 * Client-reported: other clients show it, but a modified client can claim anything.
 */
export const DEAFENED_ATTRIBUTE = "club.stablecat.pinniped.deafened";

export const isDeafened = (
  attributes: Record<string, string> | undefined,
): boolean => attributes?.[DEAFENED_ATTRIBUTE] === "true";

/** This client's deafen state, kept so it is still known when the call connects. */
export const localDeafened$ = new BehaviorSubject(false);
setAudioEnabled$.subscribe((outputEnabled) =>
  localDeafened$.next(!outputEnabled),
);

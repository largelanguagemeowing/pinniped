/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { Subject } from "rxjs";

/**
 * A call sound for the embedding client to play: Pinniped chooses the sound, the widget only
 * says when it happens. `loop` repeats until its `stop` (by id); `intro` plays first.
 */
export type CallSoundCommand =
  | { op: "play"; sound: string }
  | { op: "loop"; sound: string; intro?: string; id: number }
  | { op: "stop"; id: number };

export const callSoundCommand$ = new Subject<CallSoundCommand>();

let nextLoopId = 0;

export const playCallSound = (sound: string): void => {
  callSoundCommand$.next({ op: "play", sound });
};

/** Starts a sound that repeats until the returned function is called. */
export const loopCallSound = (sound: string, intro?: string): (() => void) => {
  const id = ++nextLoopId;
  callSoundCommand$.next({ op: "loop", sound, intro, id });
  return (): void => callSoundCommand$.next({ op: "stop", id });
};

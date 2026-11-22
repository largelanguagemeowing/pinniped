/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import {
  type Observable,
  combineLatest,
  defer,
  distinctUntilChanged,
  map,
  of,
  switchMap,
} from 'rxjs';

import { type Behavior } from '../../plugins/call/engine/state/Behavior';
import { pickPipMedia, pipHasVideo, type PipShare, type PipUser } from './pipMedia';

/** The parts of a participant's media the floating window reads. */
export interface PipUserMedia {
  id: string;
  local: boolean;
  videoEnabled$: Behavior<boolean>;
  speaking$: Behavior<boolean>;
}

export interface PipShareMedia {
  id: string;
  local: boolean;
}

export interface PipSource<U extends PipUserMedia, S extends PipShareMedia> {
  userMedia$: Behavior<U[]>;
  screenShares$: Behavior<S[]>;
  focusedMediaId$: Behavior<string | null>;
}

export interface PipSelection<U, S> {
  /** What the window shows; null when there is nothing with video. */
  media: U | S | null;
  /** Whether anyone has a camera on or shares a screen (the window only shows then). */
  hasVideo: boolean;
}

/**
 * Follows a call and says what the floating window should show (see `pickPipMedia`). Emits
 * only when that changes. Keeps when each person began speaking and the last choice per
 * subscription.
 */
export function observePipMedia$<U extends PipUserMedia, S extends PipShareMedia>(
  source: PipSource<U, S>,
  now: () => number = Date.now
): Observable<PipSelection<U, S>> {
  return defer(() => {
    const speakingSince = new Map<string, number>();
    let previousId: string | null = null;

    return combineLatest([source.userMedia$, source.screenShares$, source.focusedMediaId$]).pipe(
      switchMap(([users, shares, focusedId]) => {
        const flags$ =
          users.length === 0
            ? of([] as { user: U; videoEnabled: boolean; speaking: boolean }[])
            : combineLatest(
                users.map((user) =>
                  combineLatest([user.videoEnabled$, user.speaking$]).pipe(
                    map(([videoEnabled, speaking]) => ({ user, videoEnabled, speaking }))
                  )
                )
              );
        return flags$.pipe(map((flags) => ({ flags, shares, focusedId })));
      }),
      map(({ flags, shares, focusedId }): PipSelection<U, S> => {
        const present = new Set(flags.map(({ user }) => user.id));
        speakingSince.forEach((_, id) => {
          if (!present.has(id)) speakingSince.delete(id);
        });
        const users: PipUser[] = flags.map(({ user, videoEnabled, speaking }) => {
          if (!speaking) speakingSince.delete(user.id);
          else if (!speakingSince.has(user.id)) speakingSince.set(user.id, now());
          return {
            id: user.id,
            local: user.local,
            videoEnabled,
            speakingSince: speakingSince.get(user.id) ?? null,
          };
        });
        const pipShares: PipShare[] = shares.map((s) => ({ id: s.id, local: s.local }));
        const id = pickPipMedia({ focusedId, users, shares: pipShares, previousId });
        previousId = id;
        const media =
          id === null
            ? null
            : (flags.find(({ user }) => user.id === id)?.user ??
              shares.find((s) => s.id === id) ??
              null);
        return { media, hasVideo: pipHasVideo(users, pipShares) };
      }),
      distinctUntilChanged((a, b) => a.media === b.media && a.hasVideo === b.hasVideo)
    );
  });
}

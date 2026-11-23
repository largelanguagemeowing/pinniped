/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { type BehaviorSubject, combineLatest, type Observable, of, switchMap } from 'rxjs';

import { type GridTileViewModel } from '../../../../plugins/call/engine/state/TileViewModel';

/** The tiles of people showing video, or all of them when `hideVideoless` is off or nobody does. */
export function pickVideoTiles<T extends { hasVideo: boolean }>(
  tiles: readonly T[],
  hideVideoless: boolean,
  /** Screen shares fill the grid too, so a call of only voices and a share keeps just the share. */
  screenShareCount: number
): T[] {
  if (!hideVideoless) return [...tiles];
  const withVideo = tiles.filter((t) => t.hasVideo);
  // An empty grid would show nothing at all, so a call without any video shows everyone.
  if (withVideo.length === 0 && screenShareCount === 0) return [...tiles];
  return withVideo;
}

const hasVideo = (tile: GridTileViewModel): boolean => {
  const media = tile.media$.value;
  return media.type === 'user' && media.videoEnabled$.value;
};

/** Emits whenever any tile's person turns their camera on or off (and once on subscribing). */
function cameraChanges$(grid: readonly GridTileViewModel[]): Observable<unknown> {
  if (grid.length === 0) return of(undefined);
  return combineLatest(
    grid.map((tile) =>
      tile.media$.pipe(
        switchMap((media) => (media.type === 'user' ? media.videoEnabled$ : of(false)))
      )
    )
  );
}

/** Subscribes to a Behavior-like subject's current value. */
export function useSubjectValue<T>(subject$: BehaviorSubject<T>): T {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const subscription = subject$.subscribe(onChange);
      return () => subscription.unsubscribe();
    },
    [subject$]
  );
  return useSyncExternalStore(subscribe, () => subject$.value);
}

/**
 * The grid's tiles, without those who are not showing video while `hideVideoless$` is on.
 * Follows cameras turning on and off.
 *
 * The result is a function of the grid and the cameras as they are right now, never of earlier
 * renders: the grid is rebuilt by the call whenever the number of tiles shown changes (which
 * this hook changes), so a stale answer for a new grid would flip the count back and forth.
 */
export function useVideoTiles(
  grid: readonly GridTileViewModel[],
  hideVideoless$: BehaviorSubject<boolean>,
  screenShareCount: number
): GridTileViewModel[] {
  const hideVideoless = useSubjectValue(hideVideoless$);
  // A string of 1s and 0s, which changes exactly when a camera does, and compares by value.
  const cameras = useSyncExternalStore(
    useCallback(
      (onChange) => {
        if (!hideVideoless) return () => undefined;
        const subscription = cameraChanges$(grid).subscribe(onChange);
        return () => subscription.unsubscribe();
      },
      [grid, hideVideoless]
    ),
    () => (hideVideoless ? grid.map((tile) => (hasVideo(tile) ? '1' : '0')).join('') : '')
  );

  return useMemo(() => {
    const tiles = grid.map((tile, i) => ({ tile, hasVideo: cameras[i] === '1' }));
    return pickVideoTiles(tiles, hideVideoless, screenShareCount).map(({ tile }) => tile);
  }, [grid, cameras, hideVideoless, screenShareCount]);
}

/*
Copyright 2026 Pinniped contributors

SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE in the repository root for full details.
*/

import { useEffect, useState } from 'react';
import { distinctUntilChanged, map, merge, of, switchMap } from 'rxjs';

import { type GridTileViewModel } from '../../../../plugins/call/engine/state/TileViewModel';
import { useInitial, useReactiveState } from '../hooks';
import { pickStripPeople, SpeechLog, type StripCandidate, type StripPeople } from './stripOrder';

type StripTile = StripCandidate & { tile: GridTileViewModel };

/**
 * The people the participant strip shows: up to `capacity` of `grid`, those talking or just
 * done first, each keeping their slot until they drop out (see `pickStripPeople`).
 */
export function useStripPeople(
  grid: readonly GridTileViewModel[],
  capacity: number
): GridTileViewModel[] {
  const log = useInitial(() => new SpeechLog());
  // Bumped when the log changes or a "just spoke" status runs out; re-picks the strip.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    log.keepOnly(new Set(grid.map((tile) => tile.id)));
    const subscription = merge(
      ...grid.map((tile) =>
        tile.media$.pipe(
          switchMap((media) => (media.type === 'user' ? media.speaking$ : of(false))),
          distinctUntilChanged(),
          map((speaking) => ({ id: tile.id, speaking }))
        )
      )
    ).subscribe(({ id, speaking }) => {
      if (log.note(id, speaking, Date.now())) setTick((t) => t + 1);
    });
    return () => subscription.unsubscribe();
  }, [grid, log]);

  useEffect(() => {
    const expiry = log.nextExpiry(Date.now());
    if (expiry === null) return undefined;
    const timer = setTimeout(() => setTick((t) => t + 1), expiry - Date.now());
    return () => clearTimeout(timer);
  }, [log, tick]);

  const [people] = useReactiveState<StripPeople<StripTile>>(
    (previous) => {
      const candidates = grid.map((tile) => {
        const media = tile.media$.value;
        return {
          tile,
          id: tile.id,
          local: media.type === 'user' && media.local,
          speaking: log.speaking(tile.id),
          lastSpoke: log.lastSpoke(tile.id),
        };
      });
      return pickStripPeople(candidates, capacity, Date.now(), previous?.slots);
    },
    [grid, capacity, tick]
  );
  return people.tiles.map(({ tile }) => tile);
}

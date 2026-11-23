// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import {
  pickVideoTiles,
  useVideoTiles,
} from '../../../src/app/features/call/stage/grid/videoTiles';
import { type GridTileViewModel } from '../../../src/app/plugins/call/engine/state/TileViewModel';

const tile = (id: string, videoEnabled: boolean, type: 'user' | 'ringing' = 'user') => {
  const videoEnabled$ = new BehaviorSubject(videoEnabled);
  const media = { id, type, videoEnabled$ };
  return {
    id,
    videoEnabled$,
    vm: { media$: new BehaviorSubject(media) } as unknown as GridTileViewModel,
  };
};
const ids = (tiles: readonly GridTileViewModel[]) =>
  tiles.map((t) => (t.media$ as BehaviorSubject<{ id: string }>).value.id);

describe('pickVideoTiles', () => {
  const tiles = [
    { id: 'cam', hasVideo: true },
    { id: 'voice', hasVideo: false },
  ];

  it('keeps everyone while the filter is off', () => {
    expect(pickVideoTiles(tiles, false, 0)).toEqual(tiles);
  });

  it('keeps only people with video while on', () => {
    expect(pickVideoTiles(tiles, true, 0).map((t) => t.id)).toEqual(['cam']);
  });

  it('shows everyone when nobody has video and nothing is shared', () => {
    const voices = [tiles[1], { id: 'other', hasVideo: false }];
    expect(pickVideoTiles(voices, true, 0)).toEqual(voices);
  });

  it('leaves the grid to the screen shares when only voices remain', () => {
    expect(pickVideoTiles([tiles[1]], true, 1)).toEqual([]);
  });
});

/** Renders the hook; `result.current` is its latest value. */
function renderHook<P, R>(use: (props: P) => R, initialProps: P) {
  const result = { current: undefined as R };
  function Probe({ props }: { props: P }) {
    result.current = use(props);
    return null;
  }
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<Probe props={initialProps} />);
  });
  return {
    result,
    rerender: (props: P) => act(() => renderer.update(<Probe props={props} />)),
  };
}

describe('useVideoTiles', () => {
  it('follows cameras turning on and off, and the toggle', () => {
    const cam = tile('cam', true);
    const voice = tile('voice', false);
    const ringing = tile('ring', true, 'ringing');
    const grid = [cam.vm, voice.vm, ringing.vm];
    const hide$ = new BehaviorSubject(false);
    const { result } = renderHook(() => useVideoTiles(grid, hide$, 0), undefined);
    expect(ids(result.current)).toEqual(['cam', 'voice', 'ring']);

    act(() => hide$.next(true));
    expect(ids(result.current)).toEqual(['cam']);

    act(() => voice.videoEnabled$.next(true));
    expect(ids(result.current)).toEqual(['cam', 'voice']);

    act(() => cam.videoEnabled$.next(false));
    expect(ids(result.current)).toEqual(['voice']);

    act(() => hide$.next(false));
    expect(ids(result.current)).toEqual(['cam', 'voice', 'ring']);
  });

  it('never shows an unfiltered grid when the call rebuilds it', () => {
    // The call rebuilds the grid whenever the number of tiles shown changes; showing everyone for
    // a render after that would change the number again, and the grid would flip for good.
    const hide$ = new BehaviorSubject(true);
    const seen: string[][] = [];
    const { rerender } = renderHook(
      ({ grid }: { grid: GridTileViewModel[] }) => {
        const tiles = useVideoTiles(grid, hide$, 0);
        seen.push(ids(tiles));
        return tiles;
      },
      { grid: [tile('a', true).vm, tile('b', false).vm] }
    );
    rerender({ grid: [tile('b', false).vm, tile('a', true).vm] });
    rerender({ grid: [tile('c', false).vm, tile('d', true).vm] });
    expect(seen.every((shown) => shown.length === 1)).toBe(true);
    expect(seen.at(-1)).toEqual(['d']);
  });

  it('keeps the same tiles array while nothing changed', () => {
    const grid = [tile('a', true).vm, tile('b', false).vm];
    const hide$ = new BehaviorSubject(true);
    const { result, rerender } = renderHook(
      ({ grid: g }: { grid: GridTileViewModel[] }) => useVideoTiles(g, hide$, 0),
      { grid }
    );
    const first = result.current;
    rerender({ grid });
    expect(result.current).toBe(first);
  });
});

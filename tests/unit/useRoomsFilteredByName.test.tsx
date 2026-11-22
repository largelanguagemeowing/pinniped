import { EventEmitter } from 'events';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { MatrixClient, RoomEvent } from 'matrix-js-sdk';
import {
  filterRoomIdsByName,
  useRoomsFilteredByName,
} from '../../src/app/hooks/useRoomsFilteredByName';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeClient(names: Record<string, string>) {
  const rooms = Object.fromEntries(
    Object.entries(names).map(([roomId, name]) => [roomId, { roomId, name }])
  );
  const emitter = new EventEmitter();
  const mx = Object.assign(emitter, { getRoom: (roomId: string) => rooms[roomId] ?? null });
  return {
    mx: mx as unknown as MatrixClient,
    rename: (roomId: string, name: string) => {
      rooms[roomId].name = name;
      emitter.emit(RoomEvent.Name, rooms[roomId]);
    },
    listeners: () => emitter.listenerCount(RoomEvent.Name),
  };
}

describe('filterRoomIdsByName', () => {
  const { mx } = makeClient({ a: 'Alice', b: 'Bob', c: 'alice cooper', d: 'bi\u202eDi' });
  const ids = ['a', 'b', 'c', 'd', 'gone'];

  it('returns every room for a blank term', () => {
    expect(filterRoomIdsByName(mx, ids, '')).toBe(ids);
    expect(filterRoomIdsByName(mx, ids, '   ')).toBe(ids);
  });

  it('matches case-insensitively, trimmed, and keeps the order', () => {
    expect(filterRoomIdsByName(mx, ids, ' ALICE ')).toEqual(['a', 'c']);
  });

  it('matches the name as displayed, without the characters the display strips', () => {
    expect(filterRoomIdsByName(mx, ids, 'bidi')).toEqual(['d']);
  });

  it('drops rooms the client does not know', () => {
    expect(filterRoomIdsByName(mx, ['gone'], 'x')).toEqual([]);
  });
});

describe('useRoomsFilteredByName', () => {
  it('follows a rename while a filter is active, and listens only then', () => {
    const { mx, rename, listeners } = makeClient({ a: 'Alice', b: 'Bob' });
    const ids = ['a', 'b'];
    let result: string[] = [];
    function Probe({ term }: { term: string }) {
      result = useRoomsFilteredByName(mx, ids, term);
      return null;
    }

    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Probe term="" />);
    });
    expect(listeners()).toBe(0);

    act(() => renderer.update(<Probe term="carol" />));
    expect(result).toEqual([]);
    expect(listeners()).toBe(1);

    act(() => rename('b', 'Carol'));
    expect(result).toEqual(['b']);

    act(() => renderer.update(<Probe term="" />));
    expect(listeners()).toBe(0);
  });
});

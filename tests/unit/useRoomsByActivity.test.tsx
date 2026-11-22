import { EventEmitter } from 'events';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { MatrixClient, RoomEvent } from 'matrix-js-sdk';
import { useRoomsByActivity } from '../../src/app/hooks/useRoomsByActivity';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type FakeRoom = { roomId: string; ts: number; getLastActiveTimestamp: () => number };

function makeClient(timestamps: Record<string, number>) {
  const rooms: Record<string, FakeRoom> = {};
  const addRoom = (roomId: string, ts: number) => {
    const room: FakeRoom = { roomId, ts, getLastActiveTimestamp: () => room.ts };
    rooms[roomId] = room;
  };
  Object.entries(timestamps).forEach(([roomId, ts]) => addRoom(roomId, ts));
  const emitter = new EventEmitter();
  const mx = Object.assign(emitter, { getRoom: (roomId: string) => rooms[roomId] ?? null });
  return {
    mx: mx as unknown as MatrixClient,
    addRoom,
    /** an event lands in the room's live timeline (or at its start, when backfilled) */
    receive: (roomId: string, ts: number, toStartOfTimeline = false) => {
      if (!toStartOfTimeline) rooms[roomId].ts = ts;
      emitter.emit(RoomEvent.Timeline, {}, rooms[roomId], toStartOfTimeline);
    },
    listeners: () => emitter.listenerCount(RoomEvent.Timeline),
  };
}

function mount(mx: MatrixClient, initial: string[]) {
  const seen: string[][] = [];
  let renders = 0;
  function Probe({ roomIds }: { roomIds: string[] }) {
    renders += 1;
    seen.push(useRoomsByActivity(mx, roomIds));
    return null;
  }
  const renderer = create(<Probe roomIds={initial} />);
  return {
    renderer,
    Probe,
    order: () => seen[seen.length - 1],
    renders: () => renders,
  };
}

describe('useRoomsByActivity', () => {
  it('orders rooms newest first', () => {
    const { mx } = makeClient({ a: 1, b: 3, c: 2 });
    let probe!: ReturnType<typeof mount>;
    act(() => {
      probe = mount(mx, ['a', 'b', 'c']);
    });
    expect(probe.order()).toEqual(['b', 'c', 'a']);
  });

  it('moves a room to the top when an event lands in it', () => {
    const { mx, receive } = makeClient({ a: 1, b: 3, c: 2 });
    let probe!: ReturnType<typeof mount>;
    act(() => {
      probe = mount(mx, ['a', 'b', 'c']);
    });

    act(() => receive('a', 10));
    expect(probe.order()).toEqual(['a', 'b', 'c']);
  });

  it('does not render again when the event leaves the order unchanged', () => {
    const { mx, receive } = makeClient({ a: 1, b: 3, c: 2 });
    let probe!: ReturnType<typeof mount>;
    act(() => {
      probe = mount(mx, ['a', 'b', 'c']);
    });
    const before = probe.renders();

    act(() => receive('b', 11));
    act(() => receive('b', 12));
    expect(probe.renders()).toBe(before);
  });

  it('ignores backfilled history and rooms outside the list', () => {
    const { mx, receive, addRoom } = makeClient({ a: 1, b: 3 });
    addRoom('elsewhere', 0);
    let probe!: ReturnType<typeof mount>;
    act(() => {
      probe = mount(mx, ['a', 'b']);
    });
    const before = probe.renders();

    act(() => receive('a', 99, true));
    act(() => receive('elsewhere', 99));
    expect(probe.renders()).toBe(before);
    expect(probe.order()).toEqual(['b', 'a']);
  });

  it('orders a changed set of rooms without showing the old order', () => {
    const { mx, addRoom } = makeClient({ a: 1, b: 3 });
    let probe!: ReturnType<typeof mount>;
    act(() => {
      probe = mount(mx, ['a', 'b']);
    });

    addRoom('c', 5);
    act(() => {
      probe.renderer.update(<probe.Probe roomIds={['a', 'b', 'c']} />);
    });
    expect(probe.order()).toEqual(['c', 'b', 'a']);

    act(() => {
      probe.renderer.update(<probe.Probe roomIds={['a', 'c']} />);
    });
    expect(probe.order()).toEqual(['c', 'a']);
  });

  it('follows events in a room that joined after mounting', () => {
    const { mx, addRoom, receive } = makeClient({ a: 1, b: 3 });
    let probe!: ReturnType<typeof mount>;
    act(() => {
      probe = mount(mx, ['a', 'b']);
    });
    addRoom('c', 0);
    act(() => {
      probe.renderer.update(<probe.Probe roomIds={['a', 'b', 'c']} />);
    });

    act(() => receive('c', 20));
    expect(probe.order()).toEqual(['c', 'b', 'a']);
  });

  it('stops listening on unmount', () => {
    const { mx, listeners } = makeClient({ a: 1 });
    let probe!: ReturnType<typeof mount>;
    act(() => {
      probe = mount(mx, ['a']);
    });
    expect(listeners()).toBe(1);
    act(() => probe.renderer.unmount());
    expect(listeners()).toBe(0);
  });
});

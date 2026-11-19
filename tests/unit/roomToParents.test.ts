import { describe, expect, it } from 'vitest';
import { createStore } from 'jotai';
import { enableMapSet } from 'immer';
import { roomToParentsAtom } from '../../src/app/state/room/roomToParents';

enableMapSet();

const isTopLevel = (store: ReturnType<typeof createStore>, roomId: string) =>
  !store.get(roomToParentsAtom).has(roomId);

describe('space parent links', () => {
  it('keeps a subspace under its other parent when one parent drops it', () => {
    const store = createStore();
    // Root has two subspaces, A and B; the subspace S is listed by both.
    store.set(roomToParentsAtom, { type: 'PUT', parent: '!root', children: ['!a', '!b'] });
    store.set(roomToParentsAtom, { type: 'PUT', parent: '!a', children: ['!s'] });
    store.set(roomToParentsAtom, { type: 'PUT', parent: '!b', children: ['!s'] });

    // A drops S: the m.space.child event for S in A is cleared, so the SpaceChild handler
    // unlinks only that pair.
    store.set(roomToParentsAtom, { type: 'UNLINK', parent: '!a', child: '!s' });

    expect(isTopLevel(store, '!s')).toBe(false);
    expect(store.get(roomToParentsAtom).get('!s')).toEqual(new Set(['!b']));
  });
});

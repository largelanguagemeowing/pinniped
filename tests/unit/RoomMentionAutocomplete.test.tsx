import React from 'react';
import { act, create } from 'react-test-renderer';
import { createStore, Provider } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { RoomMentionAutocomplete } from '../../src/app/components/editor/autocomplete/RoomMentionAutocomplete';
import { allRoomsAtom } from '../../src/app/state/room-list/roomList';

const lastActive: Record<string, number> = { '!old:x': 1, '!mid:x': 5, '!new:x': 9 };

const mx = {
  getUserId: () => '@me:x',
  getRoom: (roomId: string) => ({
    roomId,
    name: roomId,
    getLastActiveTimestamp: () => lastActive[roomId],
    getCanonicalAlias: () => undefined,
    getJoinRule: () => 'invite',
    getType: () => undefined,
  }),
};
vi.mock('../../src/app/hooks/useMatrixClient', () => ({ useMatrixClient: () => mx }));
vi.mock('../../src/app/components/editor/autocomplete/AutocompleteMenu', () => ({
  AutocompleteMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../src/app/components/editor/autocomplete/useAutocompleteEnter', () => ({
  useAutocompleteEnter: () => undefined,
}));
vi.mock('../../src/app/hooks/useKeyDown', () => ({ useKeyDown: () => undefined }));
vi.mock('../../src/app/components/room-avatar', () => ({
  RoomAvatar: () => null,
  RoomIcon: () => null,
}));

vi.stubGlobal('window', {});

describe('RoomMentionAutocomplete', () => {
  it('sorts a copy of the joined rooms and leaves the shared list as it is', () => {
    const store = createStore();
    const joined = ['!old:x', '!new:x', '!mid:x'];
    store.set(allRoomsAtom, { type: 'INITIALIZE', rooms: joined });
    const shared = store.get(allRoomsAtom);

    let r!: ReturnType<typeof create>;
    act(() => {
      r = create(
        <Provider store={store}>
          <RoomMentionAutocomplete
            roomId="!here:x"
            editor={{} as never}
            query={{ text: '', range: {} as never }}
            requestClose={() => undefined}
          />
        </Provider>
      );
    });

    // the suggestions still lead with the most recently active room
    expect(JSON.stringify(r.toJSON())).toMatch(/!new:x.*!mid:x.*!old:x/);
    expect(store.get(allRoomsAtom)).toBe(shared);
    expect(shared).toEqual(['!old:x', '!new:x', '!mid:x']);
  });
});

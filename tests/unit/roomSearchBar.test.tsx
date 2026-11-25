import React from 'react';
import { act, create } from 'react-test-renderer';
import { createStore, Provider } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { RoomSearchBar } from '../../src/app/features/message-search/RoomSearchBar';
import { roomSearchLookupAtom, roomSearchTermAtom } from '../../src/app/state/roomSearch';

vi.mock('folds', () => ({
  Box: 'div',
  Chip: 'button',
  Icon: 'span',
  Icons: {},
  Input: React.forwardRef<HTMLInputElement, Record<string, unknown>>(
    ({ before: _b, after: _a, ...props }, ref) => <input ref={ref} {...props} />
  ),
  MenuItem: 'button',
  Text: 'span',
  config: { space: { S200: '0' } },
}));
vi.mock('../../src/app/features/message-search/RoomSearchBar.css', () => ({
  SearchForm: 'f',
  Suggestions: 's',
  SuggestionTitle: 't',
}));

const users = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ userId: `@user${i}:example.org`, name: `User ${i}` }));

describe('RoomSearchBar suggestions', () => {
  const setup = () => {
    const store = createStore();
    store.set(roomSearchLookupAtom, { users: users(8), rooms: [] });
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <Provider store={store}>
          <RoomSearchBar />
        </Provider>
      );
    });
    const input = () => renderer.root.findByType('input');
    const press = (key: string) => {
      const preventDefault = vi.fn();
      act(() => input().props.onKeyDown({ key, altKey: false, preventDefault }));
    };
    // the caret sits after `from:`, which lists the people
    act(() => input().props.onFocus());
    act(() => input().props.onChange({ target: { value: 'from:', selectionStart: 5 } }));
    return { store, renderer, input, press };
  };

  it('does not complete from a highlight that the shrunken list no longer has', () => {
    const { store, input, press } = setup();
    for (let i = 0; i < 6; i += 1) press('ArrowDown');

    // someone leaves the room; the lookup is rebuilt with two people
    act(() => store.set(roomSearchLookupAtom, { users: users(2), rooms: [] }));

    expect(() => press('Enter')).not.toThrow();
    // nothing stale was accepted: the box still holds what was typed
    expect(input().props.value).toBe('from:');
    expect(store.get(roomSearchTermAtom)).toBeUndefined();
  });
});

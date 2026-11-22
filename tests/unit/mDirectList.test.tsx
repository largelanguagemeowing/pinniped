import { EventEmitter } from 'events';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { describe, expect, it } from 'vitest';
import { ClientEvent, MatrixClient } from 'matrix-js-sdk';
import { mDirectAtom, useBindMDirectAtom } from '../../src/app/state/mDirectList';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const directEvent = (content: Record<string, unknown>) => ({
  getType: () => 'm.direct',
  getContent: () => content,
});

function makeClient(content?: Record<string, unknown>) {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    getAccountData: () => (content ? directEvent(content) : undefined),
  }) as unknown as MatrixClient & EventEmitter;
}

function Bind({ mx }: { mx: MatrixClient }) {
  useBindMDirectAtom(mx, mDirectAtom);
  return null;
}

const mountOn = (store: ReturnType<typeof createStore>, mx: MatrixClient) => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <JotaiProvider store={store}>
        <Bind mx={mx} />
      </JotaiProvider>
    );
  });
  return renderer;
};

describe('useBindMDirectAtom', () => {
  it('loads the direct rooms and follows updates', () => {
    const store = createStore();
    const mx = makeClient({ '@a:x': ['!one:x'], '@b:x': ['!two:x'] });
    mountOn(store, mx);
    expect(store.get(mDirectAtom)).toEqual(new Set(['!one:x', '!two:x']));

    act(() => {
      mx.emit(ClientEvent.AccountData, directEvent({ '@a:x': ['!three:x'] }));
    });
    expect(store.get(mDirectAtom)).toEqual(new Set(['!three:x']));
  });

  it('has no direct rooms for an account without m.direct, whatever an account before it had', () => {
    const store = createStore();
    const first = mountOn(store, makeClient({ '@a:x': ['!one:x'] }));
    expect(store.get(mDirectAtom).size).toBe(1);
    act(() => first.unmount());

    mountOn(store, makeClient());
    expect(store.get(mDirectAtom)).toEqual(new Set());
  });
});

import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { Provider as JotaiProvider, atom, createStore } from 'jotai';
import { MemoryRouter, NavigateFunction, Path, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import {
  getNavPathname,
  useNavToActivePathMapper,
} from '../../src/app/hooks/useNavToActivePathMapper';
import { NavToActivePathProvider } from '../../src/app/state/hooks/navToActivePath';
import { NavToActivePathAction, NavToActivePathAtom } from '../../src/app/state/navToActivePath';
import { getRoomsRoomPath, getSpaceRoomPath } from '../../src/app/pages/pathUtils';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const makeNavToActivePathAtom = (): NavToActivePathAtom => {
  const pathsAtom = atom(new Map<string, Path>());
  return atom(
    (get) => get(pathsAtom),
    (get, set, action: NavToActivePathAction) => {
      const paths = new Map(get(pathsAtom));
      if (action.type === 'DELETE') paths.delete(action.navId);
      else paths.set(action.navId, action.path);
      set(pathsAtom, paths);
    }
  );
};

type Harness = {
  store: ReturnType<typeof createStore>;
  navToActivePathAtom: NavToActivePathAtom;
  navigate: NavigateFunction;
};

const mountMapper = async (navId: string, initialPath: string): Promise<Harness> => {
  const store = createStore();
  const navToActivePathAtom = makeNavToActivePathAtom();
  let navigate: NavigateFunction | undefined;

  function Probe() {
    useNavToActivePathMapper(navId);
    navigate = useNavigate();
    return null;
  }

  await act(async () => {
    create(
      <JotaiProvider store={store}>
        <NavToActivePathProvider value={navToActivePathAtom}>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path="/rooms/:roomIdOrAlias/:eventId?/" element={<Probe />} />
              <Route path="/:spaceIdOrAlias/:roomIdOrAlias/:eventId?/" element={<Probe />} />
            </Routes>
          </MemoryRouter>
        </NavToActivePathProvider>
      </JotaiProvider>
    );
  });

  if (!navigate) throw new Error('mapper did not render');
  return { store, navToActivePathAtom, navigate };
};

describe('getNavPathname', () => {
  it('drops a percent-encoded or raw event id', () => {
    expect(getNavPathname('/rooms/!room%3Aexample.org/%24event%3Aexample.org')).toBe(
      '/rooms/!room%3Aexample.org'
    );
    expect(getNavPathname('/rooms/!room:example.org/$event:example.org')).toBe(
      '/rooms/!room:example.org'
    );
  });

  it('keeps the trailing slash of a hand-written path', () => {
    expect(getNavPathname('/rooms/!room%3Aexample.org/%24event%3Aexample.org/')).toBe(
      '/rooms/!room%3Aexample.org/'
    );
  });

  it('leaves paths that do not end in a message target alone', () => {
    for (const pathname of [
      '/rooms/',
      '/rooms/!room%3Aexample.org',
      '/rooms/search/',
      '/!space%3Aexample.org/lobby/',
      '/home/',
      '/',
    ]) {
      expect(getNavPathname(pathname)).toBe(pathname);
    }
  });
});

describe('nav tab active path', () => {
  it('remembers the room, not the message a notification opened', async () => {
    const { store, navToActivePathAtom, navigate } = await mountMapper(
      'rooms',
      getRoomsRoomPath('!first:example.org')
    );

    await act(async () => {
      navigate(getRoomsRoomPath('!room:example.org', '$event:example.org'));
    });

    expect(store.get(navToActivePathAtom).get('rooms')).toEqual({
      pathname: getRoomsRoomPath('!room:example.org'),
      search: '',
      hash: '',
    });
  });

  it('remembers the room, not the message a notification opened in a space', async () => {
    const { store, navToActivePathAtom, navigate } = await mountMapper(
      '!space:example.org',
      getSpaceRoomPath('!space:example.org', '!first:example.org')
    );

    await act(async () => {
      navigate(getSpaceRoomPath('!space:example.org', '!room:example.org', '$event:example.org'));
    });

    expect(store.get(navToActivePathAtom).get('!space:example.org')).toEqual({
      pathname: getSpaceRoomPath('!space:example.org', '!room:example.org'),
      search: '',
      hash: '',
    });
  });

  it('keeps a path without a message target unchanged', async () => {
    const { store, navToActivePathAtom, navigate } = await mountMapper(
      'rooms',
      getRoomsRoomPath('!first:example.org')
    );

    await act(async () => {
      navigate('/rooms/search/?term=cats#top');
    });

    expect(store.get(navToActivePathAtom).get('rooms')).toEqual({
      pathname: '/rooms/search/',
      search: '?term=cats',
      hash: '#top',
    });
  });
});

import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import { useRoomNavigate } from '../../src/app/hooks/useRoomNavigate';
import { MatrixClientProvider } from '../../src/app/hooks/useMatrixClient';
import { mDirectAtom } from '../../src/app/state/mDirectList';
import { getHomeRoomPath, getRoomsRoomPath } from '../../src/app/pages/pathUtils';

// The real settings module reads localStorage at import time, which node does not have.
vi.mock('../../src/app/state/settings', () => ({ settingsAtom: 'settings' }));
vi.mock('../../src/app/state/hooks/settings', () => ({ useSetting: () => [false] }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DM = '!dm:example.org';
const ROOM = '!room:example.org';

/** The navigateRoom of the first render, as a callback created then and run later holds it. */
async function mountFirstNavigateRoom() {
  const store = createStore();
  const mx = { getRoom: () => null } as unknown as MatrixClient;
  let first: ReturnType<typeof useRoomNavigate>['navigateRoom'] | undefined;

  function Probe() {
    const { navigateRoom } = useRoomNavigate();
    first ??= navigateRoom;
    return null;
  }

  const router = createMemoryRouter([{ path: '*', element: <Probe /> }], {
    initialEntries: ['/inbox/invites/'],
  });
  await act(async () => {
    create(
      <JotaiProvider store={store}>
        <MatrixClientProvider value={mx}>
          <RouterProvider router={router} />
        </MatrixClientProvider>
      </JotaiProvider>
    );
  });
  if (!first) throw new Error('Probe did not render');
  return { store, router, navigateRoom: first };
}

describe('useRoomNavigate', () => {
  it('opens a room that became a direct message after the caller rendered under Home', async () => {
    const { store, router, navigateRoom } = await mountFirstNavigateRoom();

    // accepting a DM invite: the join and the m.direct update land after the click's render
    await act(async () => {
      store.set(mDirectAtom, { type: 'UPDATE', rooms: new Set([DM]) });
    });
    await act(async () => {
      navigateRoom(DM);
    });

    expect(router.state.location.pathname).toBe(getHomeRoomPath(DM));
  });

  it('opens other rooms without a space under Rooms', async () => {
    const { store, router, navigateRoom } = await mountFirstNavigateRoom();
    await act(async () => {
      store.set(mDirectAtom, { type: 'UPDATE', rooms: new Set([DM]) });
    });

    await act(async () => {
      navigateRoom(ROOM);
    });

    expect(router.state.location.pathname).toBe(getRoomsRoomPath(ROOM));
  });
});

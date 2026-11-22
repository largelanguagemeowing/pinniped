// @vitest-environment jsdom
import React from 'react';
import { act, create, ReactTestInstance } from 'react-test-renderer';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import { Home } from '../../src/app/pages/client/home/Home';
import { ScreenSize, ScreenSizeProvider } from '../../src/app/hooks/useScreenSize';
import { MatrixClientProvider } from '../../src/app/hooks/useMatrixClient';
import { getHomeInvitesPath } from '../../src/app/pages/pathUtils';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ directs: [] as string[] }));

vi.mock('../../src/app/pages/client/direct/useDirectRooms', () => ({
  useDirectRooms: () => state.directs,
}));
vi.mock('../../src/app/hooks/useNavToActivePathMapper', () => ({
  useNavToActivePathMapper: () => {},
}));
vi.mock('../../src/app/hooks/useRoomsNotificationPreferences', () => ({
  getRoomNotificationMode: () => undefined,
  useRoomsNotificationPreferencesContext: () => ({}),
}));
// build-time constants the bundler injects
vi.hoisted(() => {
  vi.stubGlobal('__APP_VERSION__', 'test');
  vi.stubGlobal('__APP_COMMIT__', 'test');
});
// vanilla-extract styles need the build plugin; the classes are not under test
const styles = vi.hoisted(
  () => () =>
    new Proxy({} as Record<string, unknown>, {
      has: (_, key) => key !== 'then',
      get: (_, key) => (key === 'then' || key === '__esModule' ? undefined : () => 'style'),
    })
);
vi.mock('../../src/app/pages/client/home/Home.css', styles);
vi.mock('../../src/app/components/nav/styles.css', styles);
vi.mock('../../src/app/components/page/style.css', styles);
vi.mock('../../src/app/components/virtualizer/style.css', styles);
vi.mock('../../src/app/features/call-status/styles.css', styles);
vi.mock('../../src/app/components/room-avatar/RoomAvatar.css', styles);
vi.mock('../../src/app/styles/FocusRing.css', styles);
vi.mock('../../src/app/components/slider/Slider.css', styles);
vi.mock('../../src/app/features/soundboard/styles.css', styles);
// the Inbox module pulls in the whole app; the invites entry only matters as a link
vi.mock('../../src/app/pages/client/inbox/Inbox', () => ({
  InvitesNavItem: ({ to }: { to: string }) => <a href={to}>Invites</a>,
}));
vi.mock('../../src/app/features/screenshare-picker/styles.css', styles);
vi.mock('../../src/app/features/call/styles.css', styles);
vi.mock('../../src/app/styles/ContainerColor.css', styles);
vi.mock('../../src/app/features/room-nav', () => ({ RoomNavItem: () => null }));

const mx = {
  getRoom: (roomId: string) => ({ roomId, name: roomId, getLastActiveTimestamp: () => 0 }),
  on: () => {},
  removeListener: () => {},
} as unknown as MatrixClient;

function mount() {
  const store = createStore();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <JotaiProvider store={store}>
        <MatrixClientProvider value={mx}>
          <ScreenSizeProvider value={ScreenSize.Desktop}>
            <MemoryRouter>
              <Home />
            </MemoryRouter>
          </ScreenSizeProvider>
        </MatrixClientProvider>
      </JotaiProvider>
    );
  });
  return renderer;
}

const links = (renderer: ReturnType<typeof create>): ReactTestInstance[] =>
  renderer.root.findAll((node) => typeof node.type === 'string' && node.type === 'a');

describe('Home', () => {
  it('keeps the invites link in reach for an account without direct messages', () => {
    state.directs = [];
    const renderer = mount();
    expect(links(renderer).map((a) => a.props.href)).toContain(getHomeInvitesPath());
  });

  it('says so when the filter matches no conversation, and not otherwise', () => {
    state.directs = ['!alice:example.org', '!bob:example.org'];
    const renderer = mount();
    const filter = renderer.root.findAll(
      (node) => node.type === 'input' && node.props['aria-label'] === 'Find a conversation'
    )[0];
    const noMatchShown = () => JSON.stringify(renderer.toJSON()).includes('No conversations match');

    act(() => filter.props.onChange({ target: { value: 'zzz' } }));
    expect(noMatchShown()).toBe(true);

    act(() => filter.props.onChange({ target: { value: 'alice' } }));
    expect(noMatchShown()).toBe(false);
  });
});

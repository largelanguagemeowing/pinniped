import React from 'react';
import { EventEmitter } from 'node:events';
import { MatrixEvent, MatrixEventEvent, RoomEvent } from 'matrix-js-sdk';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientNonUIFeatures } from '../../src/app/pages/client/ClientNonUIFeatures';
import { getInboxInvitesPath } from '../../src/app/pages/pathUtils';

const state = vi.hoisted(() => ({
  navigateRoom: vi.fn(),
  navigate: vi.fn(),
  invites: [] as string[],
  directs: new Set<string>(),
  parents: new Map(),
  unread: new Map(),
  mx: undefined as unknown,
  pushActions: { notify: true, tweaks: { sound: 'default' } },
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('jotai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jotai')>();
  // The mocked state modules below hand string pseudo-atoms to the hooks;
  // real atoms (e.g. callEmbedAtom in EventSounds) use the real implementation.
  return {
    ...actual,
    useAtomValue: (atomOrKey: unknown) =>
      typeof atomOrKey === 'string'
        ? state[atomOrKey as 'invites' | 'directs' | 'parents' | 'unread']
        : actual.useAtomValue(atomOrKey as never),
    useAtom: (atomOrKey: unknown) =>
      typeof atomOrKey === 'string'
        ? [state[atomOrKey as 'invites' | 'directs' | 'parents' | 'unread'], vi.fn()]
        : actual.useAtom(atomOrKey as never),
  };
});
vi.mock('../../src/app/state/room/roomToUnread', () => ({ roomToUnreadAtom: 'unread' }));
vi.mock('../../src/app/state/room-list/inviteList', () => ({ allInvitesAtom: 'invites' }));
vi.mock('../../src/app/state/room/roomToParents', () => ({ roomToParentsAtom: 'parents' }));
vi.mock('../../src/app/state/mDirectList', () => ({ mDirectAtom: 'directs' }));
vi.mock('../../src/app/state/settings', () => ({
  settingsAtom: 'settings',
  // The real module reads localStorage at import time, which the node test
  // environment does not have. This shape makes playEventSound skip sounds.
  getSettings: () => ({ isNotificationSounds: false, soundToggles: {} }),
}));
vi.mock('../../src/app/state/hooks/settings', () => ({
  useSetting: (
    _atom: unknown,
    key: 'showNotifications' | 'isNotificationSounds' | 'twitterEmoji' | 'pageZoom'
  ) => [
    { showNotifications: true, isNotificationSounds: false, twitterEmoji: true, pageZoom: 100 }[
      key
    ],
  ],
}));
vi.mock('../../src/app/hooks/useMatrixClient', () => ({ useMatrixClient: () => state.mx }));
vi.mock('../../src/app/hooks/useRoomNavigate', () => ({
  useRoomNavigate: () => ({ navigateRoom: state.navigateRoom }),
}));
vi.mock('../../src/app/hooks/router/useSelectedRoom', () => ({ useSelectedRoom: () => undefined }));
vi.mock('../../src/app/hooks/router/useInbox', () => ({
  useInboxNotificationsSelected: () => false,
}));
vi.mock('../../src/app/hooks/useMediaAuthentication', () => ({
  useMediaAuthentication: () => false,
}));
vi.mock('../../src/app/hooks/useSpaceAutoJoinGlobal', () => ({ useSpaceAutoJoinGlobal: vi.fn() }));
vi.mock('../../src/app/hooks/useNotificationDefaultsSync', () => ({
  useNotificationDefaultsSync: vi.fn(),
}));
vi.mock('../../src/app/hooks/useRoomNavShortcuts', () => ({ useRoomNavShortcuts: vi.fn() }));
vi.mock('../../src/app/hooks/useRoomNavHistory', () => ({ useRoomNavHistory: vi.fn() }));
vi.mock('../../src/app/hooks/useCallEmbed', () => ({ useCallJoined: () => false }));
vi.mock('../../src/app/hooks/useSoundToggle', () => ({ useSoundToggle: () => false }));
vi.mock('../../src/app/hooks/useSoundVolume', () => ({ useSoundVolume: vi.fn() }));
vi.mock('../../src/app/state/gifFavorites', () => ({
  migrateGifFavorites: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/app/utils/dom', () => ({
  notificationPermission: () => true,
  setFavicon: vi.fn(),
}));
vi.mock('../../src/app/utils/matrix', () => ({ getMxIdLocalPart: () => 'alice' }));
vi.mock('../../src/app/utils/room', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/utils/room')>()),
  getNotificationType: () => 'all',
  getUnreadInfo: () => ({ total: 1, highlight: 0 }),
}));

class DesktopNotification {
  static instances: DesktopNotification[] = [];

  onclick?: (event: Event) => void;

  close = vi.fn();

  constructor(
    public title: string,
    public options: { body?: string; tag?: string }
  ) {
    DesktopNotification.instances.push(this);
  }
}

let renderer: ReactTestRenderer | undefined;
let client: EventEmitter;
const focus = vi.fn();
const setBadgeCount = vi.fn();
const showWindow = vi.fn();
const browserWindow = {
  Notification: DesktopNotification,
  closed: false,
  focus,
  cinnyDesktop: { platform: 'win32', setBadgeCount, showWindow },
};

function mount() {
  act(() => {
    renderer = create(<ClientNonUIFeatures>{null}</ClientNonUIFeatures>);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  DesktopNotification.instances = [];
  state.invites = [];
  state.directs.clear();
  state.unread = new Map();
  state.pushActions = { notify: true, tweaks: { sound: 'default' } };
  client = new EventEmitter();
  state.mx = Object.assign(client, {
    getSyncState: () => 'SYNCING',
    getUserId: () => '@me:example.org',
    getPushActionsForEvent: () => state.pushActions,
    decryptEventIfNeeded: vi.fn().mockResolvedValue(undefined),
  });
  browserWindow.closed = false;
  vi.stubGlobal('window', browserWindow);
  vi.stubGlobal('document', {
    hasFocus: () => false,
    documentElement: { style: { setProperty: vi.fn(), removeProperty: vi.fn() } },
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        fillText: vi.fn(),
        measureText: () => ({ width: 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 0 }),
      }),
      toDataURL: () => 'data:image/png;base64,overlay',
    }),
  });
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

function clickAndExpect(notification: DesktopNotification, closed: boolean, navigate: () => void) {
  browserWindow.closed = closed;
  const event = new Event('click', { cancelable: true });
  expect(notification.onclick).toBeTypeOf('function');
  notification.onclick?.(event);
  expect.soft(focus).toHaveBeenCalledTimes(closed ? 0 : 1);
  expect.soft(event.defaultPrevented).toBe(true);
  navigate();
  expect(notification.close).toHaveBeenCalledOnce();
}

describe('desktop message notification clicks', () => {
  it.each([
    { encrypted: false, dm: false },
    { encrypted: false, dm: true },
    { encrypted: true, dm: false },
    { encrypted: true, dm: true },
  ])('focuses and navigates to the message ($encrypted encrypted, $dm DM)', ({ encrypted, dm }) => {
    const roomId = '!room:example.org';
    const eventId = '$message:example.org';
    if (dm) state.directs.add(roomId);
    mount();
    const event = new MatrixEvent({
      event_id: eventId,
      room_id: roomId,
      sender: '@alice:example.org',
      type: encrypted ? 'm.room.encrypted' : 'm.room.message',
      content: encrypted
        ? { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'ciphertext' }
        : { msgtype: 'm.text', body: 'Hello from Alice' },
    });
    const room = {
      roomId,
      name: 'General',
      isSpaceRoom: () => false,
      getMember: () => ({ rawDisplayName: 'Alice', getMxcAvatarUrl: () => undefined }),
      getMxcAvatarUrl: () => undefined,
      hasUserReadEvent: () => false,
    };
    act(() => {
      client.emit(RoomEvent.Timeline, event, room, false, false, { liveEvent: true });
      if (encrypted) {
        expect(DesktopNotification.instances).toHaveLength(0);
        vi.spyOn(event, 'getType').mockReturnValue('m.room.message');
        vi.spyOn(event, 'getContent').mockReturnValue({
          msgtype: 'm.text',
          body: 'Hello from Alice',
        });
        client.emit(MatrixEventEvent.Decrypted, event);
      }
    });
    expect(DesktopNotification.instances).toHaveLength(1);
    const [notification] = DesktopNotification.instances;
    expect(notification.title).toBe(dm ? 'Alice' : 'Alice (#General)');
    expect(notification.options).toMatchObject({
      body: 'Hello from Alice',
      tag: roomId,
    });
    clickAndExpect(notification, false, () => {
      expect(state.navigateRoom).toHaveBeenCalledOnce();
      expect(state.navigateRoom).toHaveBeenCalledWith(roomId, eventId);
      expect(state.navigate).not.toHaveBeenCalled();
    });
    vi.clearAllMocks();
    clickAndExpect(notification, true, () => {
      expect(state.navigateRoom).not.toHaveBeenCalled();
    });
  });
});

describe('desktop invitation notification clicks', () => {
  it.each([false, true])('handles an invitation when window.closed is %s', (closed) => {
    mount();
    state.invites = ['!invite:example.org'];
    act(() => {
      renderer?.update(<ClientNonUIFeatures>{null}</ClientNonUIFeatures>);
    });
    expect(DesktopNotification.instances).toHaveLength(1);
    const [notification] = DesktopNotification.instances;
    expect(notification.title).toBe('Invitation');
    expect(notification.options.body).toBe('You have 1 new invitation request.');
    clickAndExpect(notification, closed, () => {
      if (closed) expect(state.navigate).not.toHaveBeenCalled();
      else {
        expect(state.navigate).toHaveBeenCalledOnce();
        expect(state.navigate).toHaveBeenCalledWith(getInboxInvitesPath());
      }
      expect(state.navigateRoom).not.toHaveBeenCalled();
    });
  });
});

describe('message delivery independent of room counters', () => {
  const room = {
    roomId: '!room:example.org',
    name: 'General',
    isSpaceRoom: () => false,
    getMember: () => ({ rawDisplayName: 'Alice', getMxcAvatarUrl: () => undefined }),
    getMxcAvatarUrl: () => undefined,
    hasUserReadEvent: () => false,
  };
  const message = (id: string, msgtype = 'm.text') =>
    new MatrixEvent({
      event_id: id,
      room_id: room.roomId,
      sender: '@alice:example.org',
      type: 'm.room.message',
      content: { msgtype, body: 'Hello' },
    });
  const deliver = (event: MatrixEvent, liveEvent = true, removed = false) =>
    act(() => {
      client.emit(RoomEvent.Timeline, event, room, false, removed, { liveEvent });
    });

  it('notifies for successive text, image, video, audio and file events, once per event', () => {
    mount();
    ['m.text', 'm.image', 'm.video', 'm.audio', 'm.file'].forEach((type, index) => {
      const event = message(`$${index}`, type);
      deliver(event);
      deliver(event);
    });
    expect(DesktopNotification.instances.map((n) => n.options.body)).toEqual([
      'Hello',
      'Sent an image',
      'Sent a video',
      'Sent an audio message',
      'Sent a file',
    ]);
  });

  it.each(['m.sticker', 'm.poll.start', 'org.matrix.msc3381.poll.start'])(
    'notifies for %s without a text body',
    (type) => {
      mount();
      const event = new MatrixEvent({
        event_id: '$nontext',
        room_id: room.roomId,
        sender: '@alice:example.org',
        type,
        content: {},
      });
      deliver(event);
      expect(DesktopNotification.instances).toHaveLength(1);
      expect(DesktopNotification.instances[0].options.body).toBe(
        type === 'm.sticker' ? 'Sent a sticker' : 'Started a poll'
      );
    }
  );

  it('respects push rules and ignores history, removals, own messages and edits', () => {
    mount();
    state.pushActions.notify = false;
    deliver(message('$muted'));
    state.pushActions.notify = true;
    deliver(message('$history'), false);
    deliver(message('$removed'), true, true);
    const own = message('$own');
    vi.spyOn(own, 'getSender').mockReturnValue('@me:example.org');
    deliver(own);
    const edit = message('$edit');
    vi.spyOn(edit, 'getRelation').mockReturnValue({ rel_type: 'm.replace', event_id: '$original' });
    deliver(edit);
    expect(DesktopNotification.instances).toHaveLength(0);
  });

  it('retries live encrypted media after key arrival without replaying history', () => {
    mount();
    const event = message('$encrypted', 'm.image');
    const type = vi.spyOn(event, 'getType').mockReturnValue('m.room.encrypted');
    deliver(event);
    act(() => {
      client.emit(MatrixEventEvent.Decrypted, event, new Error('Missing key'));
    });
    expect(DesktopNotification.instances).toHaveLength(0);
    type.mockReturnValue('m.room.message');
    act(() => {
      client.emit(MatrixEventEvent.Decrypted, event);
      client.emit(MatrixEventEvent.Decrypted, event);
      client.emit(MatrixEventEvent.Decrypted, message('$old'));
    });
    expect(DesktopNotification.instances).toHaveLength(1);
    expect(DesktopNotification.instances[0].options.body).toBe('Sent an image');
  });
});

describe('desktop unread badge', () => {
  it('shows a dot for uncounted unread rooms, counts DMs and mentions once, then clears', () => {
    state.unread = new Map([['!room', { total: 0, highlight: 0, from: null }]]);
    mount();
    expect(setBadgeCount).toHaveBeenLastCalledWith(0, 'data:image/png;base64,overlay', true);
    state.directs.add('!dm');
    state.unread = new Map([
      ['!room', { total: 7, highlight: 2, from: null }],
      ['!dm', { total: 3, highlight: 1, from: null }],
      ['!space', { total: 10, highlight: 3, from: new Set(['!room', '!dm']) }],
    ]);
    act(() => renderer?.update(<ClientNonUIFeatures>{null}</ClientNonUIFeatures>));
    expect(setBadgeCount).toHaveBeenLastCalledWith(5, 'data:image/png;base64,overlay', true);
    state.unread = new Map();
    act(() => renderer?.update(<ClientNonUIFeatures>{null}</ClientNonUIFeatures>));
    expect(setBadgeCount).toHaveBeenLastCalledWith(0, undefined, false);
    act(() => renderer?.unmount());
    expect(setBadgeCount).toHaveBeenLastCalledWith(0, undefined, false);
  });
});

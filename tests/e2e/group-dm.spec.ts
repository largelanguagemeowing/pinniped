import { expect, test, type Page } from '@playwright/test';
import { loginWithTestAccount, ownUserId, signIn } from './support/auth';
import { fourthCredentials, peerCredentials, thirdCredentials } from './support/env';
import { matrixRequest } from './support/matrix';
import {
  acceptDirectInvite,
  createDirectMessage,
  currentRoomId,
  leaveRooms,
} from './support/rooms';

// Four people sign in here, each with a device of their own.
test.use({ storageState: { cookies: [], origins: [] } });
test.skip(
  !process.env.E2E_FOURTH_USERNAME,
  'needs three more accounts (E2E_PEER_*, E2E_THIRD_*, E2E_FOURTH_*)'
);

/** Sends an invite from the room's menu; what follows depends on the room. */
async function invite(page: Page, userId: string): Promise<void> {
  await page.getByRole('banner').getByRole('button', { name: 'More Options', exact: true }).click();
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  const userIdInput = page.locator('input[name="userIdInput"]');
  await userIdInput.fill(userId);
  await page
    .locator('form', { has: userIdInput })
    .getByRole('button', { name: 'Invite', exact: true })
    .click();
}

const roomPath = (roomId: string) => `/rooms/${encodeURIComponent(roomId)}`;

const stateContent = async <T>(page: Page, roomId: string, type: string): Promise<T> =>
  (await matrixRequest<T>(page, {
    method: 'GET',
    path: `${roomPath(roomId)}/state/${type}`,
  })) as T;

type PowerLevels = {
  invite?: number;
  kick?: number;
  ban?: number;
  users?: Record<string, number>;
  events?: Record<string, number>;
};

/** Whether the server lets this person's request through (a 403 is a refusal). */
const refused = async (page: Page, path: string, body: object): Promise<boolean> =>
  matrixRequest(page, { method: 'POST', path, body }).then(
    () => false,
    (error: Error) => error.message.includes('(403)')
  );

const joinedMembers = async (page: Page, roomId: string): Promise<string[]> =>
  Object.keys(
    (
      await matrixRequest<{ joined: object }>(page, {
        method: 'GET',
        path: `${roomPath(roomId)}/joined_members`,
      })
    )?.joined ?? {}
  ).sort();

/** Client-side navigation, so the list shows what this already synced session knows. */
const openList = (page: Page, path: '/home/' | '/rooms/') =>
  page.evaluate((to) => {
    window.history.pushState(null, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);

/** The decoded targets of the links into a list's rooms. */
const linksInto = (page: Page, list: 'home' | 'rooms') =>
  page
    .locator(`a[href^="/${list}/"]`)
    .evaluateAll((links) => links.map((a) => decodeURIComponent(a.getAttribute('href') ?? '')));

/** Listed with the direct messages under Home, and not with the rooms. */
async function expectDirectMessage(page: Page, roomId: string): Promise<void> {
  await openList(page, '/home/');
  await expect.poll(() => linksInto(page, 'home')).toContainEqual(expect.stringContaining(roomId));
  await openList(page, '/rooms/');
  await expect(page.getByText('Create Room', { exact: true }).first()).toBeVisible();
  expect(await linksInto(page, 'rooms')).not.toContainEqual(expect.stringContaining(roomId));
}

/**
 * The chat the invitee lands in after an invite from a one-to-one chat: opened for us, the
 * original left alone.
 */
async function inviteFromOneToOne(page: Page, dmId: string, userId: string): Promise<string> {
  await invite(page, userId);
  await expect.poll(() => currentRoomId(page)).not.toBe(dmId);
  const groupId = currentRoomId(page);
  await page.keyboard.press('Escape');
  return groupId;
}

test('version 12: both are creators, and the new group is open to everyone but kicking and banning', async ({
  page,
  browser,
}) => {
  const peer = await signIn(browser, peerCredentials());
  const third = await signIn(browser, thirdCredentials());
  const fourth = await signIn(browser, fourthCredentials());
  const rooms: string[] = [];

  try {
    await loginWithTestAccount(page);
    const meId = await ownUserId(page);
    const peerId = await ownUserId(peer);
    const thirdId = await ownUserId(third);
    const fourthId = await ownUserId(fourth);

    // a one-to-one chat, on version 12 unless chosen otherwise
    const dmId = await createDirectMessage(page, peerId);
    rooms.push(dmId);
    await acceptDirectInvite(peer, dmId);
    const create = await stateContent<{ room_version: string; additional_creators?: string[] }>(
      page,
      dmId,
      'm.room.create'
    );
    expect(create.room_version).toBe('12');
    expect(create.additional_creators).toContain(peerId);

    // the invite button starts a new group instead of adding to it
    const groupId = await test.step('a new group for the third person', () =>
      inviteFromOneToOne(page, dmId, thirdId));
    rooms.push(groupId);
    await acceptDirectInvite(third, groupId);
    await acceptDirectInvite(peer, groupId, { known: true });

    await expect.poll(() => joinedMembers(page, groupId)).toEqual([meId, peerId, thirdId].sort());
    expect(await joinedMembers(page, dmId)).toEqual([meId, peerId].sort());
    for (const [who, member] of [
      ['creator', page],
      ['peer', peer],
      ['invited third', third],
    ] as const) {
      await test.step(`the group is a direct message for the ${who}`, () =>
        expectDirectMessage(member, groupId));
    }

    await test.step('only the creator can kick and ban', async () => {
      const levels = await stateContent<PowerLevels>(page, groupId, 'm.room.power_levels');
      expect(levels).toMatchObject({ invite: 0, kick: 100, ban: 100 });
      // members are plain: none of them is given power
      expect(Object.keys(levels.users ?? {})).not.toContain(peerId);
      for (const action of ['kick', 'ban']) {
        expect(
          await refused(peer, `${roomPath(groupId)}/${action}`, { user_id: thirdId }),
          action
        ).toBe(true);
      }
    });

    await test.step('everyone can send messages and join calls', async () => {
      await matrixRequest(peer, {
        method: 'PUT',
        path: `${roomPath(groupId)}/send/m.room.message/e2e-${Date.now()}`,
        body: { msgtype: 'm.text', body: 'hello' },
      });
      const key = encodeURIComponent(`_${peerId}_E2EDEVICE`);
      await matrixRequest(peer, {
        method: 'PUT',
        path: `${roomPath(groupId)}/state/org.matrix.msc3401.call.member/${key}`,
        body: {},
      });
    });

    // the group takes a fourth person from the invite dialog, with no new room
    await page.goto(`/home/${encodeURIComponent(groupId)}`);
    await invite(page, fourthId);
    await acceptDirectInvite(fourth, groupId);
    await expect
      .poll(() => joinedMembers(page, groupId))
      .toEqual([meId, peerId, thirdId, fourthId].sort());
    expect(currentRoomId(page)).toBe(groupId);
  } finally {
    for (const member of [peer, third, fourth]) {
      await leaveRooms(member, rooms).catch(() => undefined);
    }
    await leaveRooms(page, rooms);
    await peer.context().close();
    await third.context().close();
    await fourth.context().close();
  }
});

test('version 11: nobody can invite a third person to the chat, but the invite button starts a group', async ({
  page,
  browser,
}) => {
  const peer = await signIn(browser, peerCredentials());
  const third = await signIn(browser, thirdCredentials());
  const fourth = await signIn(browser, fourthCredentials());
  const rooms: string[] = [];

  try {
    await loginWithTestAccount(page);
    const meId = await ownUserId(page);
    const peerId = await ownUserId(peer);
    const thirdId = await ownUserId(third);
    const fourthId = await ownUserId(fourth);

    const dmId = await createDirectMessage(page, peerId, { version: '11' });
    rooms.push(dmId);
    await acceptDirectInvite(peer, dmId);

    await test.step('the server refuses an invite from either of them', async () => {
      expect(
        (await stateContent<{ room_version: string }>(page, dmId, 'm.room.create')).room_version
      ).toBe('11');
      for (const [who, member] of [
        ['creator', page],
        ['peer', peer],
      ] as const) {
        expect(await refused(member, `${roomPath(dmId)}/invite`, { user_id: thirdId }), who).toBe(
          true
        );
      }
    });

    // the button still works: it starts a group, which needs no invite right in this chat
    const groupId = await test.step('a new group for the third person', () =>
      inviteFromOneToOne(page, dmId, thirdId));
    rooms.push(groupId);
    await acceptDirectInvite(third, groupId);
    await acceptDirectInvite(peer, groupId, { known: true });

    await expect.poll(() => joinedMembers(page, groupId)).toEqual([meId, peerId, thirdId].sort());
    expect(await joinedMembers(page, dmId)).toEqual([meId, peerId].sort());
    const thirdsRooms = await matrixRequest<{ joined_rooms: string[] }>(third, {
      method: 'GET',
      path: '/joined_rooms',
    });
    expect(thirdsRooms?.joined_rooms).not.toContain(dmId);

    // a member who did not create the group can add people to it
    // (as a direct invite, the way Pinniped sends it, so it opens as a direct message)
    await matrixRequest(peer, {
      method: 'PUT',
      path: `${roomPath(groupId)}/state/m.room.member/${encodeURIComponent(fourthId)}`,
      body: { membership: 'invite', is_direct: true },
    });
    await acceptDirectInvite(fourth, groupId);
    await expect
      .poll(() => joinedMembers(page, groupId))
      .toEqual([meId, peerId, thirdId, fourthId].sort());
  } finally {
    for (const member of [peer, third, fourth]) {
      await leaveRooms(member, rooms).catch(() => undefined);
    }
    await leaveRooms(page, rooms);
    await peer.context().close();
    await third.context().close();
    await fourth.context().close();
  }
});

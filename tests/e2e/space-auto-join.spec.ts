import { expect, test, type Browser, type Page } from '@playwright/test';
import { ownUserId, signIn } from './support/auth';
import { e2eCredentials, peerCredentials } from './support/env';
import { matrixRequest } from './support/matrix';
import { leaveRooms, roomPath } from './support/rooms';

// A space asks its members' clients to join its rooms. Each room is joined once; a room someone
// then left stays left, wherever they left it. Three sessions: the space's owner, and the member
// on a laptop and, later, on a new device.
test.use({ storageState: { cookies: [], origins: [] } });
test.skip(!process.env.E2E_PEER_USERNAME, 'needs a second account (E2E_PEER_USERNAME)');

const AUTO_JOIN = 'club.stablecat.pinniped.space.auto_join';
const SETTLED = 'club.stablecat.pinniped.auto_join_settled';

const createRoom = async (page: Page, name: string, type?: 'm.space'): Promise<string> => {
  const created = await matrixRequest<{ room_id: string }>(page, {
    method: 'POST',
    path: '/createRoom',
    body: {
      name,
      preset: 'public_chat',
      ...(type && { creation_content: { type } }),
    },
  });
  if (!created) throw new Error('createRoom returned nothing');
  return created.room_id;
};

const addChild = (page: Page, spaceId: string, childId: string, server: string) =>
  matrixRequest(page, {
    method: 'PUT',
    path: `${roomPath(spaceId)}/state/m.space.child/${encodeURIComponent(childId)}`,
    body: { via: [server] },
  });

const joinedRooms = async (page: Page): Promise<string[]> =>
  (await matrixRequest<{ joined_rooms: string[] }>(page, { method: 'GET', path: '/joined_rooms' }))
    ?.joined_rooms ?? [];

const settledRooms = async (page: Page, userId: string): Promise<string[]> =>
  Object.keys(
    (
      await matrixRequest<{ rooms?: Record<string, number> }>(page, {
        method: 'GET',
        path: `/user/${encodeURIComponent(userId)}/account_data/${SETTLED}`,
        allowNotFound: true,
      })
    )?.rooms ?? {}
  );

/**
 * Leaves as another app would: a bare request with the session's token, while Pinniped is not
 * running anywhere, so it never sees the leave happen.
 */
async function leaveWithoutPinniped(
  browser: Browser,
  session: { homeserver: string; token: string },
  roomId: string
): Promise<void> {
  const context = await browser.newContext();
  try {
    const response = await context.request.post(
      `${session.homeserver}/_matrix/client/v3${roomPath(roomId)}/leave`,
      { headers: { Authorization: `Bearer ${session.token}` }, data: {} }
    );
    expect(response.ok()).toBe(true);
  } finally {
    await context.close();
  }
}

test('a room left on another app is not joined again, new rooms still are', async ({ browser }) => {
  const stamp = Date.now();
  const owner = await signIn(browser, peerCredentials());
  const laptop = await signIn(browser, e2eCredentials);
  let newDevice: Page | undefined;
  // the space comes first, so the member leaves it before its rooms
  const created: string[] = [];

  try {
    const memberId = await ownUserId(laptop);
    const server = memberId.slice(memberId.indexOf(':') + 1);

    const spaceId = await createRoom(owner, `auto-join space ${stamp}`, 'm.space');
    created.push(spaceId);
    const kept = await createRoom(owner, `auto-join kept ${stamp}`);
    const left = await createRoom(owner, `auto-join left ${stamp}`);
    created.push(kept, left);
    await addChild(owner, spaceId, kept, server);
    await addChild(owner, spaceId, left, server);
    await matrixRequest(owner, {
      method: 'PUT',
      path: `${roomPath(spaceId)}/state/${AUTO_JOIN}`,
      body: { auto_join: true },
    });

    // joining the space brings its rooms, and each is recorded as handled
    await matrixRequest(laptop, { method: 'POST', path: `/join/${encodeURIComponent(spaceId)}` });
    await expect
      .poll(() => joinedRooms(laptop), { timeout: 30_000 })
      .toEqual(expect.arrayContaining([kept, left]));
    await expect
      .poll(() => settledRooms(laptop, memberId), { timeout: 30_000 })
      .toEqual(expect.arrayContaining([kept, left]));

    // the laptop closes, then the member leaves one room from another app
    const session = await laptop.evaluate(() => ({
      homeserver: localStorage.getItem('cinny_hs_base_url') ?? '',
      token: localStorage.getItem('cinny_access_token') ?? '',
    }));
    expect(session.token).not.toBe('');
    await laptop.context().close();
    await leaveWithoutPinniped(browser, session, left);

    // Pinniped on a device that never saw the leave
    const device = await signIn(browser, e2eCredentials);
    newDevice = device;
    await expect.poll(() => joinedRooms(device)).toEqual(expect.arrayContaining([kept]));

    // a room added to the space is still joined, so auto-join has run since the sign-in
    const added = await createRoom(owner, `auto-join added ${stamp}`);
    created.push(added);
    await addChild(owner, spaceId, added, server);
    await expect
      .poll(() => joinedRooms(device), { timeout: 30_000 })
      .toEqual(expect.arrayContaining([added]));

    // the room that was left stays left
    await device.waitForTimeout(2000);
    expect(await joinedRooms(device)).not.toContain(left);
  } finally {
    const member = newDevice ?? laptop;
    if (!member.isClosed()) {
      const joined = new Set(await joinedRooms(member));
      await leaveRooms(
        member,
        created.filter((id) => joined.has(id))
      );
    }
    await leaveRooms(owner, created);
    await owner.context().close();
    await newDevice?.context().close();
    await laptop.context().close();
  }
});

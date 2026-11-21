import { expect, test, type Browser, type Page } from '@playwright/test';
import { loginWithTestAccount, ownUserId } from './support/auth';
import { type Credentials, peerCredentials, thirdCredentials } from './support/env';
import { matrixRequest } from './support/matrix';
import { currentRoomId, leaveRooms } from './support/rooms';

// Three people sign in here, each with a device of their own.
test.use({ storageState: { cookies: [], origins: [] } });
test.skip(!process.env.E2E_THIRD_USERNAME, 'needs two more accounts (E2E_PEER_*, E2E_THIRD_*)');

async function signIn(browser: Browser, credentials: Credentials): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await loginWithTestAccount(page, credentials);
  return page;
}

/**
 * Accepts the pending DM invite, from someone this person shares no room with (listed as
 * Public), which opens the conversation with the direct messages.
 */
async function acceptDirectInvite(page: Page, roomId: string): Promise<void> {
  await page.goto('/inbox/invites/');
  await page.getByRole('button', { name: /^Public\b/ }).click();
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await page.waitForURL(
    (url) => decodeURIComponent(url.pathname).replace(/\/$/, '') === `/home/${roomId}`
  );
  await expect(page.locator('[data-editable-name="RoomInput"]')).toBeVisible();
}

async function invite(page: Page, userId: string): Promise<void> {
  await page.getByRole('button', { name: 'More Options', exact: true }).click();
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  const userIdInput = page.locator('input[name="userIdInput"]');
  await userIdInput.fill(userId);
  await page
    .locator('form', { has: userIdInput })
    .getByRole('button', { name: 'Invite', exact: true })
    .click();
  // the prompt stays open for more invites and clears once one is sent
  await expect(userIdInput).toHaveValue('');
  await page.keyboard.press('Escape');
}

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

test('a direct message stays one for everyone after a third person is invited', async ({
  page,
  browser,
}) => {
  const peer = await signIn(browser, peerCredentials());
  const third = await signIn(browser, thirdCredentials());
  let roomId: string | undefined;

  try {
    await loginWithTestAccount(page);
    const peerId = await ownUserId(peer);
    const thirdId = await ownUserId(third);

    // a one-to-one chat
    await page.goto('/home/');
    await page.getByRole('button', { name: 'Create Chat', exact: true }).first().click();
    await page.locator('input[name="userIdInput"]').fill(peerId);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('[data-editable-name="RoomInput"]')).toBeVisible();
    roomId = currentRoomId(page);
    await acceptDirectInvite(peer, roomId);
    await test.step('a direct message for the peer', () => expectDirectMessage(peer, roomId));

    // grows into a group
    await invite(page, thirdId);
    await acceptDirectInvite(third, roomId);

    const path = `/rooms/${encodeURIComponent(roomId)}/joined_members`;
    await expect
      .poll(async () =>
        Object.keys(
          (await matrixRequest<{ joined: object }>(page, { method: 'GET', path }))?.joined ?? {}
        ).sort()
      )
      .toEqual([await ownUserId(page), peerId, thirdId].sort());
    for (const [who, member] of [
      ['creator', page],
      ['peer', peer],
      ['invited third', third],
    ] as const) {
      await test.step(`a direct message for the ${who}`, () => expectDirectMessage(member, roomId));
    }
  } finally {
    if (roomId) {
      for (const member of [peer, third]) {
        await leaveRooms(member, [roomId]).catch(() => undefined);
      }
      await leaveRooms(page, [roomId]);
    }
    await peer.context().close();
    await third.context().close();
  }
});

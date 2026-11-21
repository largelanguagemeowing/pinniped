import { expect, test, type Page } from '@playwright/test';
import { loginWithTestAccount, ownUserId } from './support/auth';
import { peerCredentials } from './support/env';
import { createRoom, leaveRooms } from './support/rooms';

// Both people sign in here, each with a device of their own. Chromium's fake microphone plays a
// beep, so each side hears the other without real devices.
test.use({
  storageState: { cookies: [], origins: [] },
  permissions: ['microphone', 'camera'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});
test.skip(!process.env.E2E_PEER_USERNAME, 'needs a second account (E2E_PEER_USERNAME)');

const tileOf = (page: Page, userId: string) =>
  page.locator(`[data-pinniped-user-id=${JSON.stringify(userId)}]`).first();

test('two people meet in a new encrypted voice room and hear each other', async ({
  page,
  browser,
}) => {
  const peerContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const peer = await peerContext.newPage();
  const roomName = `voice e2e ${Date.now()}`;
  let roomId: string | undefined;

  try {
    await loginWithTestAccount(page);
    await loginWithTestAccount(peer, peerCredentials());
    const userId = await ownUserId(page);
    const peerId = await ownUserId(peer);

    // create the room, join it and invite the peer from the call
    roomId = await createRoom(page, { name: roomName, voice: true, encrypted: true });
    await page.getByRole('button', { name: 'Join Voice', exact: true }).click();
    await expect(page.getByText('Voice Connected', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Invite to call', exact: true }).click();
    const userIdInput = page.locator('input[name="userIdInput"]');
    await userIdInput.fill(peerId);
    await page.getByRole('button', { name: 'Invite', exact: true }).click();
    // the prompt stays open for more invites and clears once one is sent
    await expect(userIdInput).toHaveValue('');
    await page.keyboard.press('Escape');

    // The peer accepts the invite; opening a voice room joins its call. They share no other room
    // with the inviter (every run leaves its room), so the invite is listed under Public.
    await peer.goto('/inbox/invites/');
    await peer.getByRole('button', { name: /^Public\b/ }).click();
    await expect(peer.getByText(roomName, { exact: true })).toBeVisible();
    await peer.getByRole('button', { name: 'Accept', exact: true }).click();
    await peer.getByRole('link', { name: roomName }).first().click();
    await expect(peer.getByText('Voice Connected', { exact: true })).toBeVisible();

    // Both see the other's tile light up: their audio arrives, decrypts and plays.
    for (const [viewer, other] of [
      [page, peerId],
      [peer, userId],
    ] as const) {
      const tile = tileOf(viewer, other);
      await expect(tile).toBeVisible();
      await expect(tile).toHaveAttribute('data-pinniped-speaking', 'true');
      await expect(viewer.getByText("Can't decrypt")).toHaveCount(0);
    }

    await peer.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(tileOf(page, peerId)).toHaveCount(0);
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(page.getByText('Voice Connected', { exact: true })).toHaveCount(0);
  } finally {
    // the peer may not have got as far as the invite
    if (roomId) {
      await leaveRooms(peer, [roomId]).catch(() => undefined);
      await leaveRooms(page, [roomId]);
    }
    await peerContext.close();
  }
});

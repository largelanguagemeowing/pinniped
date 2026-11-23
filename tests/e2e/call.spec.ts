import { expect, test, type Page } from '@playwright/test';
import { loginWithTestAccount, ownUserId, signIn } from './support/auth';
import { fakeMedia, inviteToCall, joinVoice, tearDownRoom } from './support/calls';
import { peerCredentials } from './support/env';
import { acceptRoomInvite, createRoom } from './support/rooms';

// Both people sign in here, each with a device of their own. Chromium's fake microphone plays a
// beep, so each side hears the other without real devices.
test.use(fakeMedia());
test.skip(!process.env.E2E_PEER_USERNAME, 'needs a second account (E2E_PEER_USERNAME)');

const tileOf = (page: Page, userId: string) =>
  page.locator(`[data-pinniped-user-id=${JSON.stringify(userId)}]`).first();

test('two people meet in a new encrypted voice room and hear each other', async ({
  page,
  browser,
}) => {
  const roomName = `voice e2e ${Date.now()}`;
  let peer: Page | undefined;
  let roomId: string | undefined;

  try {
    await loginWithTestAccount(page);
    peer = await signIn(browser, peerCredentials());
    const userId = await ownUserId(page);
    const peerId = await ownUserId(peer);

    // create the room, join it and invite the peer from the call
    roomId = await createRoom(page, { name: roomName, voice: true, encrypted: true });
    await joinVoice(page);
    await inviteToCall(page, peerId);

    // The peer accepts the invite; opening a voice room joins its call.
    await acceptRoomInvite(peer, roomName);
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
    await tearDownRoom(roomId, page, peer ? [peer] : []);
  }
});

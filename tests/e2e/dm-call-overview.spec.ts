import { expect, test, type Page } from '@playwright/test';
import { loginWithTestAccount, ownUserId } from './support/auth';
import { peerCredentials } from './support/env';
import { acceptDirectInvite, createDirectMessage, leaveRooms, sendMessage } from './support/rooms';

test.use({
  storageState: { cookies: [], origins: [] },
  permissions: ['microphone', 'camera'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});
test.skip(!process.env.E2E_PEER_USERNAME, 'needs a second account (E2E_PEER_USERNAME)');

// What someone who has not joined sees above the chat when the other person is in the call.
async function expectOverviewWhole(page: Page): Promise<void> {
  const pane = page.getByRole('separator', { name: 'Resize call' });
  const join = page.getByRole('button', { name: 'Join Voice', exact: true });
  // the room name, the line above the summary of who is in voice
  const name = page.getByText('is currently in voice').locator('xpath=preceding-sibling::*[1]');
  await expect(join).toBeVisible();
  const [header, separator, joinBox, nameBox] = await Promise.all([
    page
      .getByRole('banner')
      .filter({ has: page.getByRole('button', { name: 'Call', exact: true }) })
      .boundingBox(),
    pane.boundingBox(),
    join.boundingBox(),
    name.boundingBox(),
  ]);
  // everything from the room name to the Join action sits between the header and the divider,
  // not behind either
  expect(nameBox!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  expect(joinBox!.y + joinBox!.height).toBeLessThanOrEqual(separator!.y + separator!.height);
}

for (const [name, viewport] of [
  ['desktop', { width: 1280, height: 720 }],
  ['phone', { width: 390, height: 780 }],
] as const) {
  test(`${name}: the call overview above a DM chat keeps its size when the pane is dragged small`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize(viewport);
    const peerContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const peer = await peerContext.newPage();
    let roomId: string | undefined;
    try {
      await loginWithTestAccount(page);
      await loginWithTestAccount(peer, peerCredentials());
      roomId = await createDirectMessage(page, await ownUserId(peer));
      await acceptDirectInvite(peer, roomId);
      await sendMessage(page, `overview ${Date.now()}`);

      await peer.getByRole('button', { name: 'Call', exact: true }).click();
      await peer.getByRole('button', { name: 'Voice', exact: true }).click();
      await expect(peer.getByText('Voice Connected', { exact: true })).toBeVisible();

      await expectOverviewWhole(page);

      // drag the divider as far up as it goes
      const separator = page.getByRole('separator', { name: 'Resize call' });
      const box = (await separator.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, 0, { steps: 8 });
      await page.mouse.up();
      await expectOverviewWhole(page);
    } finally {
      await peer
        .getByRole('button', { name: 'Disconnect', exact: true })
        .click({ timeout: 3000 })
        .catch(() => undefined);
      if (roomId) await leaveRooms(peer, [roomId]);
      if (roomId) await leaveRooms(page, [roomId]);
      await peerContext.close();
    }
  });
}

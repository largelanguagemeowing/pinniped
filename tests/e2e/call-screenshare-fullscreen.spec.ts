import { expect, test, type Page } from '@playwright/test';
import { loginWithTestAccount, ownUserId } from './support/auth';
import { peerCredentials } from './support/env';
import { createRoom, leaveRooms } from './support/rooms';

// Chromium shares a fake screen without asking, and its fake microphone and camera need no devices.
test.use({
  storageState: { cookies: [], origins: [] },
  permissions: ['microphone', 'camera'],
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen',
    ],
  },
});
test.skip(!process.env.E2E_PEER_USERNAME, 'needs a second account (E2E_PEER_USERNAME)');

type Box = { x: number; y: number; width: number; height: number };
const boxOf = async (page: Page, selector: string): Promise<Box> => {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${selector} has no box`);
  return box;
};

test('a fullscreened screenshare fills the screen and its tags clear the call controls', async ({
  page,
  browser,
}, testInfo) => {
  const peerContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const peer = await peerContext.newPage();
  const roomName = `share e2e ${Date.now()}`;
  let roomId: string | undefined;

  try {
    await loginWithTestAccount(page);
    await loginWithTestAccount(peer, peerCredentials());
    const peerId = await ownUserId(peer);

    roomId = await createRoom(page, { name: roomName, voice: true, encrypted: true });
    await page.getByRole('button', { name: 'Join Voice', exact: true }).click();
    await expect(page.getByText('Voice Connected', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Invite to call', exact: true }).click();
    await page.locator('input[name="userIdInput"]').fill(peerId);
    await page.getByRole('button', { name: 'Invite', exact: true }).click();
    await expect(page.locator('input[name="userIdInput"]')).toHaveValue('');
    await page.keyboard.press('Escape');

    await peer.goto('/inbox/invites/');
    // listed under Public unless the two already share a room (a failed run leaves one)
    await peer.getByRole('button', { name: /^Public\b/ }).click();
    const accept = peer.getByRole('button', { name: 'Accept', exact: true });
    if (!(await accept.isVisible({ timeout: 3000 }).catch(() => false))) {
      await peer.getByRole('button', { name: /^Primary\b/ }).click();
    }
    await accept.first().click();
    await peer.getByRole('link', { name: roomName }).first().click();
    await expect(peer.getByText('Voice Connected', { exact: true })).toBeVisible();

    // the call controls fade while the pointer rests; moving it brings them back
    await peer.mouse.move(700, 400);
    await peer.mouse.move(720, 420);
    // the peer shares their screen
    await peer.getByRole('button', { name: 'Start Screenshare', exact: true }).click();
    await peer.getByRole('button', { name: 'Go Live', exact: true }).click();
    const stream = '[data-pinniped-live]';
    await expect(page.locator(stream).first()).toBeVisible();

    const wake = async () => {
      await page.mouse.move(700, 400);
      await page.mouse.move(720, 420);
    };
    await wake();
    await page.getByRole('button', { name: 'Full screen', exact: true }).click();
    await expect(page.locator('[data-call-stage][data-fullscreen="true"]')).toBeVisible();
    await wake();
    await page.waitForTimeout(1000);

    const viewport = page.viewportSize()!;
    const tag = page.locator(stream).first().getByText('e2e-peer');

    const controlsTop = async () => (await boxOf(page, '[aria-label="Full screen"]')).y;
    const gutter = 10; // the stage keeps room for a scrollbar; the 16:9 box rounds a pixel or two
    const expectFillsScreen = async () => {
      const live = await boxOf(page, stream);
      expect(live.x).toBeLessThanOrEqual(2);
      expect(live.y).toBeLessThanOrEqual(4);
      expect(live.width).toBeGreaterThanOrEqual(viewport.width - gutter);
      expect(live.height).toBeGreaterThanOrEqual(viewport.height - gutter);
    };

    // The stream fills the screen with the members strip shown too; the strip floats over its
    // bottom edge, above the call controls, and the stream's name tag clears the controls.
    await page.screenshot({ path: testInfo.outputPath('strip-shown.png') });
    await expectFillsScreen();
    const strip = await boxOf(page, '[data-pinniped-user-id]');
    expect(strip.y + strip.height).toBeLessThanOrEqual(await controlsTop());
    const tagBox = (await tag.boundingBox())!;
    expect(tagBox.y + tagBox.height).toBeLessThanOrEqual(await controlsTop());

    // At rest the strip and the controls fade away and the pointer is hidden.
    await page.waitForTimeout(3500);
    await expect(page.locator('[data-pinniped-user-id]').first()).toHaveCSS('opacity', '0');
    await expect(page.locator('[data-call-stage]')).toHaveCSS('cursor', 'none');
    await page.screenshot({ path: testInfo.outputPath('idle.png') });
    await expectFillsScreen();

    // Hiding the strip leaves the stream where it was.
    await wake();
    await page.getByRole('button', { name: /Hide Members/ }).click();
    await wake();
    await page.waitForTimeout(500);
    await page.screenshot({ path: testInfo.outputPath('strip-hidden.png') });
    await expectFillsScreen();
    const hiddenTag = (await tag.boundingBox())!;
    expect(hiddenTag.y + hiddenTag.height).toBeLessThanOrEqual(await controlsTop());
  } finally {
    if (roomId) {
      await leaveRooms(peer, [roomId]).catch(() => undefined);
      await leaveRooms(page, [roomId]);
    }
    await peerContext.close();
  }
});

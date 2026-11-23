import { expect, type Page } from '@playwright/test';
import { leaveRooms } from './rooms';

/**
 * `test.use` options for a call: a fresh browser state (the test signs in itself) and Chromium's
 * fake microphone and camera, which need no devices and no prompts.
 */
export const fakeMedia = (extraArgs: string[] = []) => ({
  storageState: { cookies: [], origins: [] },
  permissions: ['microphone', 'camera'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', ...extraArgs],
  },
});

/** Joins the open voice room's call. */
export async function joinVoice(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Join Voice', exact: true }).click();
  await expect(page.getByText('Voice Connected', { exact: true })).toBeVisible();
}

/** Invites someone from the call's own prompt, which stays open for more and clears per invite. */
export async function inviteToCall(page: Page, userId: string): Promise<void> {
  await page.getByRole('button', { name: 'Invite to call', exact: true }).click();
  const userIdInput = page.locator('input[name="userIdInput"]');
  await userIdInput.fill(userId);
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  await expect(userIdInput).toHaveValue('');
  await page.keyboard.press('Escape');
}

/** Leaves the call if this person is in one; a test that failed early may not be. */
export async function disconnectQuietly(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: 'Disconnect', exact: true })
    .click({ timeout: 3000 })
    .catch(() => undefined);
}

/**
 * Ends a test's room for everyone and closes the guests' browser contexts. A guest may not have
 * got as far as the invite, so their failures are ignored; the host's are not.
 */
export async function tearDownRoom(
  roomId: string | undefined,
  host: Page,
  guests: Page[]
): Promise<void> {
  if (roomId) {
    for (const guest of guests) await leaveRooms(guest, [roomId]).catch(() => undefined);
    await leaveRooms(host, [roomId]);
  }
  await Promise.all(guests.map((guest) => guest.context().close()));
}

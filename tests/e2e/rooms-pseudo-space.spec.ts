import { test, expect } from '@playwright/test';
import { createRoom, leaveRooms } from './support/rooms';

/**
 * E2E test for the Rooms pseudo-space.
 *
 * Rooms without a parent space live under /rooms/ (a pseudo-space tab in the
 * sidebar) while direct messages stay in the Home tab.
 */

test.describe('Rooms pseudo-space', () => {
  test('orphan rooms live under /rooms/, DMs stay in Home', async ({ page }) => {
    const roomName = `orphan e2e ${Date.now()}`;
    const roomId = await createRoom(page, { name: roomName });
    try {
      // The Rooms pseudo-space page lists orphan rooms and room actions.
      await page.goto('/rooms/');
      await expect(page.getByText('Create Room', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Join with Address', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Direct Messages', { exact: true })).toHaveCount(0);

      // Opening an orphan room keeps the URL under /rooms/ and shows the composer.
      const roomLink = page.getByRole('link', { name: roomName });
      await expect(roomLink).toBeVisible();
      await roomLink.click();
      await expect(
        page.locator('[contenteditable="true"], [data-testid="msg-input"]').first()
      ).toBeVisible({ timeout: 20_000 });
      expect(new URL(page.url()).pathname.startsWith('/rooms/')).toBe(true);

      // Home keeps DMs but no longer offers room actions or a Rooms category.
      await page.goto('/home/');
      await expect(page.getByText('Home', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Create Room', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Join with Address', { exact: true })).toHaveCount(0);
    } finally {
      await leaveRooms(page, [roomId]);
    }
  });
});

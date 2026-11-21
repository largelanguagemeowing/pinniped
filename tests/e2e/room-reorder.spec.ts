import { test, expect, type Page } from '@playwright/test';

/**
 * E2E test for per-user room reordering in the space sidebar.
 *
 * Verifies that dragging a room nav item onto another reorders them,
 * and that the order persists across a page reload (account-data backed).
 */

/** Navigate to the Unredacted Space lobby and wait for the sidebar to render rooms. */
async function goToSpace(page: Page) {
  await page.goto('/%23space%3Aunredacted.org/lobby');
  await page.waitForTimeout(2_000);
}

/** Returns the visible room paths in the space sidebar "Rooms" section, top to bottom. */
async function getRoomPaths(page: Page): Promise<string[]> {
  // Room nav links have a room alias (#room:server) in the URL, encoded as %23.
  // The Lobby and Search links don't have this pattern.
  const links = page.locator('a[href*="unredacted.org/%23"]');
  return links.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('href')).filter((href): href is string => !!href)
  );
}

async function dragSecondRoomFirst(page: Page, expectedFirst: string, attempts = 3): Promise<void> {
  const roomLinks = page.locator('a[href*="unredacted.org/%23"]');
  const source = roomLinks.nth(1).locator('xpath=ancestor::*[@draggable="true"][1]');
  const target = roomLinks.nth(0).locator('xpath=ancestor::*[@draggable="true"][1]');
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent('dragstart', { dataTransfer });
  await target.dispatchEvent('dragover', { dataTransfer });
  await target.dispatchEvent('drop', { dataTransfer });
  await source.dispatchEvent('dragend', { dataTransfer });
  await dataTransfer.dispose();
  await page.waitForTimeout(1_000);

  const current = await getRoomPaths(page);
  if (current[0] !== expectedFirst && attempts > 1) {
    await dragSecondRoomFirst(page, expectedFirst, attempts - 1);
  }
}

// @deployment: needs the federated #space:unredacted.org, so the local stack skips it
test.describe('Space sidebar room reordering', { tag: '@deployment' }, () => {
  test('drag reorders rooms and persists across reload', async ({ page }) => {
    await goToSpace(page);

    // Wait until at least 2 rooms are visible
    await expect
      .poll(async () => (await getRoomPaths(page)).length, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2);

    const before = await getRoomPaths(page);
    expect(before.length).toBeGreaterThanOrEqual(2);

    try {
      // Drag the second room onto the first room.
      await dragSecondRoomFirst(page, before[1]);

      // Verify the order changed
      const after = await getRoomPaths(page);
      expect(after.length).toBe(before.length);
      expect(after[0]).toBe(before[1]);
      expect(after[1]).toBe(before[0]);

      // Verify persistence: reload and check the order is the same
      await page.reload();
      await page.waitForTimeout(3_000);
      const afterReload = await getRoomPaths(page);
      expect(afterReload).toEqual(after);
    } finally {
      if (!page.isClosed()) {
        const current = await getRoomPaths(page);
        if (current[0] !== before[0]) {
          await dragSecondRoomFirst(page, before[0]);
          await expect.poll(() => getRoomPaths(page)).toEqual(before);
        }
      }
    }
  });
});

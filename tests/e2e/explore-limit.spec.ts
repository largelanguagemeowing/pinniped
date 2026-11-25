import { expect, test } from '@playwright/test';
import { e2eCredentials } from './support/env';

for (const limit of ['-5', 'abc', '99999999']) {
  test(`the public rooms page opens with limit=${limit}`, async ({ page }) => {
    await page.goto(`/explore/${encodeURIComponent(e2eCredentials.homeserver)}/?limit=${limit}`);

    // the page survives a page size it cannot draw and shows the one it uses
    await expect(page.getByText(/^Page Limit: \d+$/)).toBeVisible();
  });
}

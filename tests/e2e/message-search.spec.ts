import { expect, test } from '@playwright/test';
import { e2eCredentials, peerCredentials } from './support/env';
import { createDirectMessage, leaveRooms, roomPath } from './support/rooms';
import { sendMessageViaApi } from './support/timeline';

// the narrow layout has no search box in the room header, so the button opens the search page
test.use({ viewport: { width: 600, height: 900 } });

test('searching from a direct message finds what was said in it', async ({ page }) => {
  const peerId = `@${peerCredentials().username}:${e2eCredentials.homeserver}`;
  const dmId = await createDirectMessage(page, peerId);
  const word = `needle${Date.now()}`;
  await sendMessageViaApi(page, dmId, `look for the ${word} here`);

  try {
    await page.goto(roomPath(dmId).replace('/rooms/', '/home/'));
    await page.getByRole('button', { name: 'Search messages', exact: true }).click();
    await page.getByPlaceholder(/search/i).fill(word);
    await page.keyboard.press('Enter');

    await expect(page.getByText('Results for', { exact: false })).toBeVisible();
    await expect(page.getByText(`look for the`, { exact: false }).first()).toBeVisible();
  } finally {
    await leaveRooms(page, [dmId]);
  }
});

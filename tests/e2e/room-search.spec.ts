import { expect, test } from '@playwright/test';
import { createRoom, leaveRooms } from './support/rooms';

let roomId: string;
let roomName: string;
test.beforeEach(async ({ page }) => {
  roomName = `Search Words ${Date.now()}`;
  roomId = await createRoom(page, { name: roomName });
});
test.afterEach(async ({ page }) => {
  await leaveRooms(page, [roomId]);
});

test('a space after the room prefix still finds the room and highlights the word', async ({
  page,
}) => {
  await page.goto('/rooms/');
  await expect(page.getByRole('link', { name: roomName })).toBeVisible();
  await page.keyboard.press('Control+k');
  // the query is " words" once the prefix is stripped
  await page.getByPlaceholder('Search', { exact: true }).pressSequentially('# words');

  // the row before the search finishes is the unfiltered one, so wait for the highlight
  const row = page.getByRole('button', { name: roomName });
  await expect(row.locator('p span')).toHaveText('Words');
});

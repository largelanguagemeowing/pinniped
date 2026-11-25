import { expect, test } from '@playwright/test';
import { e2eCredentials, peerCredentials } from './support/env';
import { createDirectMessage, createRoom, leaveRooms } from './support/rooms';

const peerLocalPart = peerCredentials().username;
const peerId = `@${peerLocalPart}:${e2eCredentials.homeserver}`;

let roomId: string;
let dmId: string;
test.beforeEach(async ({ page }) => {
  // the people we have a direct message with are what the invite dialog suggests
  dmId = await createDirectMessage(page, peerId);
  roomId = await createRoom(page, { name: `invite e2e ${Date.now()}` });
});
test.afterEach(async ({ page }) => {
  await leaveRooms(page, [roomId, dmId]);
});

test('pasting a complete user ID over a partly typed name clears the suggestions', async ({
  page,
}) => {
  await page.getByRole('banner').getByRole('button', { name: 'More Options', exact: true }).click();
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  const input = page.locator('input[name="userIdInput"]');

  await input.pressSequentially(`@${peerLocalPart}`);
  const suggestion = page.getByRole('button', { name: peerLocalPart });
  await expect(suggestion).toBeVisible();

  // someone else on another server; Tab must not complete over what was pasted
  const pasted = `@${peerLocalPart}:other.example`;
  await input.fill(pasted);
  await expect(suggestion).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(input).toHaveValue(pasted);
});

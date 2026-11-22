import { expect, test, type Locator, type Page } from '@playwright/test';
import { loginWithTestAccount, ownUserId, signIn } from './support/auth';
import { peerCredentials, thirdCredentials } from './support/env';
import { solidPng } from './support/images';
import { matrixRequest, uploadMedia } from './support/matrix';
import {
  acceptDirectInvite,
  createDirectMessage,
  inviteFromOneToOne,
  joinedMembers,
  leaveRooms,
} from './support/rooms';

// Three people sign in here, each with a device of their own.
test.use({ storageState: { cookies: [], origins: [] } });
test.skip(!process.env.E2E_THIRD_USERNAME, 'needs two more accounts (E2E_PEER_*, E2E_THIRD_*)');

/** The media ID of an mxc:// URI, which is what the avatar's image URL carries. */
const mediaId = (mxc: string): string => mxc.slice(mxc.lastIndexOf('/') + 1);

/** The loaded avatar image of `mxc` within `scope`; an image that failed to load does not count. */
const avatarOf = (scope: Locator, mxc: string): Locator =>
  scope.locator(`img[src*="${mediaId(mxc)}"][data-image-loaded="true"]`);

const navRow = (page: Page, roomId: string): Locator =>
  page.locator(`a[href*="${encodeURIComponent(roomId)}"]`);

/** The open room's header: the one with the room menu, not the app's top bar. */
const header = (page: Page): Locator =>
  page
    .getByRole('banner')
    .filter({ has: page.getByRole('button', { name: 'More Options', exact: true }) });

/** Opens Room Settings from the room's menu and returns its Profile card. */
async function openRoomSettings(page: Page): Promise<Locator> {
  await header(page).getByRole('button', { name: 'More Options', exact: true }).click();
  await page.getByRole('button', { name: 'Room Settings', exact: true }).click();
  const profile = page.getByText('Profile', { exact: true }).locator('xpath=..');
  await expect(profile).toBeVisible();
  return profile;
}

test('a group chat shows its own icon and never one member’s picture', async ({
  page,
  browser,
}) => {
  const peer = await signIn(browser, peerCredentials());
  const third = await signIn(browser, thirdCredentials());
  const rooms: string[] = [];

  try {
    await loginWithTestAccount(page);
    const peerId = await ownUserId(peer);
    const thirdId = await ownUserId(third);

    const peerPicture = await uploadMedia(peer, {
      bytes: await solidPng(peer, '#2980b9'),
      contentType: 'image/png',
      filename: 'peer.png',
    });
    await matrixRequest(peer, {
      method: 'PUT',
      path: `/profile/${encodeURIComponent(peerId)}/avatar_url`,
      body: { avatar_url: peerPicture },
    });

    const dmId = await createDirectMessage(page, peerId);
    rooms.push(dmId);
    await acceptDirectInvite(peer, dmId);

    await test.step('a one-to-one chat shows the other person’s picture', async () => {
      await expect(avatarOf(navRow(page, dmId), peerPicture)).toBeVisible();
      await expect(avatarOf(header(page), peerPicture)).toBeVisible();
    });

    const groupId = await inviteFromOneToOne(page, dmId, thirdId);
    rooms.push(groupId);
    await acceptDirectInvite(third, groupId);
    await acceptDirectInvite(peer, groupId, { known: true });
    await expect.poll(() => joinedMembers(page, groupId)).toHaveLength(3);
    await expect(page.locator('[data-editable-name="RoomInput"]')).toBeVisible();

    await test.step('a group without an icon shows no member’s picture', async () => {
      await expect(navRow(page, groupId)).toBeVisible();
      await expect(navRow(page, groupId).locator('img')).toHaveCount(0);
      await expect(header(page).locator('img')).toHaveCount(0);
    });

    const groupIcon = await test.step('the icon is set in Room Settings', async () => {
      const settings = await openRoomSettings(page);
      await settings.getByRole('button', { name: 'Edit', exact: true }).click();
      const chooser = page.waitForEvent('filechooser');
      await settings.getByRole('button', { name: 'Upload', exact: true }).click();
      await (
        await chooser
      ).setFiles({
        name: 'group.png',
        mimeType: 'image/png',
        buffer: Buffer.from(await solidPng(page, '#27ae60')),
      });
      await settings.getByRole('button', { name: 'Save', exact: true }).click();

      await expect
        .poll(async () =>
          matrixRequest<{ url?: string }>(page, {
            method: 'GET',
            path: `/rooms/${encodeURIComponent(groupId)}/state/m.room.avatar`,
            allowNotFound: true,
          }).then((content) => content?.url)
        )
        .toMatch(/^mxc:\/\//);
      const content = await matrixRequest<{ url: string }>(page, {
        method: 'GET',
        path: `/rooms/${encodeURIComponent(groupId)}/state/m.room.avatar`,
      });
      await page.keyboard.press('Escape');
      return content?.url as string;
    });

    // soft: one run names every place that misses the icon
    await test.step('the icon shows in the list at once', async () => {
      await expect.soft(avatarOf(navRow(page, groupId), groupIcon)).toBeVisible({ timeout: 5_000 });
    });

    await test.step('the icon shows in the room header', async () => {
      await expect.soft(avatarOf(header(page), groupIcon)).toBeVisible({ timeout: 5_000 });
    });

    await test.step('Room Settings shows the icon that was set', async () => {
      const settings = await openRoomSettings(page);
      await expect.soft(avatarOf(settings, groupIcon)).toBeVisible({ timeout: 5_000 });
    });
  } finally {
    for (const member of [peer, third]) {
      await leaveRooms(member, rooms).catch(() => undefined);
    }
    await leaveRooms(page, rooms);
    await peer.context().close();
    await third.context().close();
  }
});

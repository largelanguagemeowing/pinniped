import { expect, test, type Locator, type Page } from '@playwright/test';
import { ownUserId, signIn } from './support/auth';
import { e2eCredentials, peerCredentials } from './support/env';
import {
  acceptDirectInvite,
  createDirectMessage,
  leaveRooms,
  openHome,
  sendMessage,
} from './support/rooms';

// Two people share a direct message, each signed in on a device of their own; the tests run in
// order on these two sessions. `user` stays in the chat and writes, `peer` reads, or does not.
test.skip(!process.env.E2E_PEER_USERNAME, 'needs a second account (E2E_PEER_USERNAME)');
test.describe.configure({ mode: 'serial' });

let user: Page;
let peer: Page;
let roomId: string;

const dmRow = (page: Page): Locator =>
  page.locator(`a[href^=${JSON.stringify(`/home/${encodeURIComponent(roomId)}`)}]`);

/** The unread count on the chat's row in the Home list. */
const unreadCount = (page: Page, count: number): Locator =>
  dmRow(page).getByText(String(count), { exact: true });

/** The line under the timeline that names who has read the latest message. */
const followingBar = (page: Page): Locator =>
  page.getByRole('button', { name: /following the conversation/ });

const openChat = (page: Page) => dmRow(page).click();

/** Leaves the chat for Home, with the pointer off the list: a hovered row shows its menu, not its badge. */
async function leaveChat(page: Page): Promise<void> {
  await openHome(page);
  await page.mouse.move(1, 1);
}

const newMessages = (page: Page): Locator => page.getByText('New Messages', { exact: true });

/**
 * The peer has read the whole chat and loses their connection while `count` messages come in.
 * Back online, their sync brings only the newest of them, a gap behind: the message they last
 * read is still known, but not linked to what they see. Returns the messages' texts, oldest first.
 */
async function unreadBacklog(count: number): Promise<string[]> {
  await openChat(peer);
  await expect(followingBar(user)).toBeVisible();
  await leaveChat(peer);
  await peer.context().setOffline(true);
  const stamp = Date.now();
  const texts = Array.from({ length: count }, (_, i) => `backlog ${stamp} #${i + 1}`);
  for (const text of texts) await sendMessage(user, text);
  await peer.context().setOffline(false);
  // an encrypted room's count is of the events the sync brought, not of all that came in
  await expect(dmRow(peer).getByText(/^\d+$/)).toBeVisible();
  return texts;
}

const jumpToUnread = (page: Page): Locator => page.getByRole('button', { name: 'Jump to Unread' });
const markAsRead = (page: Page): Locator => page.getByRole('button', { name: 'Mark as Read' });

/** Sets "Hide Typing & Read Receipts" on the General page, where Settings opens, and closes Settings. */
async function setHideActivity(page: Page, hide: boolean): Promise<void> {
  await page.getByRole('button', { name: 'User Settings' }).click();
  const toggle = page
    .getByText('Hide Typing & Read Receipts', { exact: true })
    .locator('xpath=../..')
    .getByRole('switch');
  if ((await toggle.isChecked()) !== hide) await toggle.click();
  await expect(toggle).toBeChecked({ checked: hide });
  await page.keyboard.press('Escape');
}

/** Whether `inner` is shown above `outer` on the page, as a reader sees them. */
async function isAbove(inner: Locator, outer: Locator): Promise<boolean> {
  const [a, b] = await Promise.all([inner.boundingBox(), outer.boundingBox()]);
  return a !== null && b !== null && a.y < b.y;
}

test.beforeAll(async ({ browser }) => {
  user = await signIn(browser, e2eCredentials);
  peer = await signIn(browser, peerCredentials());
  roomId = await createDirectMessage(user, await ownUserId(peer));
  await acceptDirectInvite(peer, roomId);
});

test.afterAll(async () => {
  if (roomId) {
    await leaveRooms(peer, [roomId]).catch(() => undefined);
    await leaveRooms(user, [roomId]);
  }
  await user?.context().close();
  await peer?.context().close();
});

test('the sender sees who follows the conversation once they read it, and who saw the message', async () => {
  await leaveChat(peer);
  await sendMessage(user, `read by peer ${Date.now()}`);
  // sent but unread: nobody follows yet
  await expect(unreadCount(peer, 1)).toBeVisible();
  await expect(followingBar(user)).toHaveCount(0);

  await openChat(peer);
  await expect(followingBar(user)).toContainText('is following the conversation');

  // the bar opens the list of readers of the latest message
  await followingBar(user).click();
  const seenBy = user.getByText('Seen by', { exact: true });
  await expect(seenBy).toBeVisible();
  const readers = user
    .getByRole('banner')
    .filter({ has: seenBy })
    .locator('xpath=following-sibling::*');
  await expect(
    readers.getByRole('button', { name: new RegExp(peerCredentials().username) })
  ).toBeVisible();
  await user.keyboard.press('Escape');
  await expect(seenBy).toHaveCount(0);
});

test('unread messages show as a count until the chat is opened, then as a New Messages line', async () => {
  const before = `before ${Date.now()}`;
  const first = `first unread ${Date.now()}`;
  const second = `second unread ${Date.now()}`;

  // the peer has read up to here
  await sendMessage(user, before);
  await expect(followingBar(user)).toBeVisible();
  await leaveChat(peer);
  await expect(unreadCount(peer, 1)).toHaveCount(0);

  await sendMessage(user, first);
  await sendMessage(user, second);
  await expect(unreadCount(peer, 2)).toBeVisible();

  await openChat(peer);
  const divider = newMessages(peer);
  await expect(divider).toBeVisible();
  // the line sits between what was read and what was not
  expect(await isAbove(peer.getByText(before, { exact: true }), divider)).toBe(true);
  expect(await isAbove(divider, peer.getByText(first, { exact: true }))).toBe(true);
  // the sender's own view never draws it for their own messages
  await expect(newMessages(user)).toHaveCount(0);

  // reading clears the count
  await leaveChat(peer);
  await expect(unreadCount(peer, 2)).toHaveCount(0);
});

test('Mark as Read reads the whole backlog at once', async () => {
  await unreadBacklog(14);
  await openChat(peer);
  await expect(jumpToUnread(peer)).toBeVisible();

  await markAsRead(peer).click();
  await expect(jumpToUnread(peer)).toHaveCount(0);
  await expect(markAsRead(peer)).toHaveCount(0);
  await expect(followingBar(user)).toContainText('is following the conversation');

  await leaveChat(peer);
  await expect(dmRow(peer).getByText(/^\d+$/)).toHaveCount(0);
});

test('with Hide Typing & Read Receipts on, the reader clears their unread count and the sender sees no one following', async () => {
  // the setting belongs to the peer's device, which this file discards
  await setHideActivity(peer, true);
  await leaveChat(peer);
  const text = `private read ${Date.now()}`;
  await sendMessage(user, text);
  await expect(followingBar(user)).toHaveCount(0);
  await expect(unreadCount(peer, 1)).toBeVisible();

  await openChat(peer);
  await expect(peer.getByText(text, { exact: true })).toBeVisible();
  await leaveChat(peer);
  await expect(unreadCount(peer, 1)).toHaveCount(0);

  // the server took the receipt: a fresh sync still counts nothing unread
  await peer.reload();
  await expect(dmRow(peer)).toBeVisible();
  await expect(unreadCount(peer, 1)).toHaveCount(0);
  await expect(followingBar(user)).toHaveCount(0);

  // turned off again, the next message the peer reads is public
  await setHideActivity(peer, false);
  await leaveChat(peer);
  await sendMessage(user, `public read ${Date.now()}`);
  await openChat(peer);
  await expect(followingBar(user)).toContainText('is following the conversation');
});

test('Jump to Unread takes the reader to the first message they have not read', async () => {
  const texts = await unreadBacklog(14);
  await openChat(peer);
  await expect(jumpToUnread(peer)).toBeVisible();
  await expect(markAsRead(peer)).toBeVisible();
  // opening the chat did not read it for them
  await expect(followingBar(user)).toHaveCount(0);

  // the reader is at the bottom, where the chat opens
  await jumpToUnread(peer).click();
  const first = peer.getByText(texts[0], { exact: true });
  await expect(first).toBeInViewport();
  await expect(newMessages(peer)).toBeInViewport();
  expect(await isAbove(newMessages(peer), first)).toBe(true);

  // the messages around it settle as they decrypt, which must not move it out of view
  await peer.waitForTimeout(2_000);
  await expect(first).toBeInViewport();
});

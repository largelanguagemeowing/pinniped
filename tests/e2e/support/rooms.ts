import { type Browser, expect, type Locator, type Page } from '@playwright/test';
import { signIn } from './auth';
import { type Credentials } from './env';
import { matrixRequest } from './matrix';

export type NewRoom = {
  name: string;
  encrypted?: boolean;
  voice?: boolean;
  /** room version from the form's Advanced Options; the server default otherwise */
  version?: string;
};

/** The room or space ID in the current URL (the last one, for a room inside a space). */
export const currentRoomId = (page: Page): string => {
  const ids = decodeURIComponent(new URL(page.url()).pathname).match(/![^/]+/g);
  if (!ids) throw new Error(`No room in ${page.url()}`);
  return ids[ids.length - 1];
};

/** Fills the Create Room form (page or modal) and submits it. */
async function fillRoomForm(form: Locator, room: NewRoom): Promise<void> {
  if (room.voice) await form.getByRole('button', { name: /^Voice Room/ }).click();
  await form.locator('input[name="nameInput"]').fill(room.name);
  if (room.encrypted) {
    await form
      .getByText('End-to-End Encryption', { exact: true })
      .locator('xpath=ancestor::*[.//*[@aria-checked]][1]')
      .locator('[aria-checked]')
      .click();
  }
  if (room.version) {
    await form.getByRole('button', { name: 'Advanced Options' }).click();
    await form
      .getByText('Version', { exact: true })
      .locator('xpath=ancestor::*[.//button][1]')
      .getByRole('button')
      .click();
    await form
      .page()
      .getByText('Versions', { exact: true })
      .locator('..')
      .getByRole('button', { name: room.version, exact: true })
      .click();
  }
  await form.getByRole('button', { name: 'Create', exact: true }).click();
}

/** Creates a room outside any space through the Create Room form and opens it. */
export async function createRoom(page: Page, room: NewRoom): Promise<string> {
  await page.goto('/rooms/');
  await page.getByText('Create Room', { exact: true }).first().click();
  await fillRoomForm(page.locator('form'), room);
  await expect(
    page
      .locator('[data-editable-name="RoomInput"]')
      .or(page.getByRole('button', { name: 'Join Voice', exact: true }))
  ).toBeVisible();
  return currentRoomId(page);
}

/** The room version choices of the Create Chat form, by their accessible names. */
const directVersionChoice = { '12': 'Both of you are creators', '11': 'Nobody can add people' };

/**
 * Starts a one-to-one chat with `userId` from Home and returns its room ID; `version` is the
 * room version picked in the form (its default is 12).
 */
export async function createDirectMessage(
  page: Page,
  userId: string,
  { version }: { version?: '12' | '11' } = {}
): Promise<string> {
  await page.goto('/home/');
  await page.getByRole('button', { name: 'Create Chat', exact: true }).first().click();
  await page.locator('input[name="userIdInput"]').fill(userId);
  if (version) await page.getByRole('radio', { name: directVersionChoice[version] }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-editable-name="RoomInput"]')).toBeVisible();
  return currentRoomId(page);
}

/** Opens the invites list on the section the inviter is in: Public, or Primary once a room is shared. */
const openInviteSection = async (page: Page, known: boolean): Promise<void> => {
  await page.goto('/inbox/invites/');
  await page.getByRole('button', { name: known ? /^Primary\b/ : /^Public\b/ }).click();
};

/**
 * Accepts the pending DM invite, which opens the conversation with the direct messages. The
 * inviter is someone this person shares no room with (listed as Public), or with `known` one
 * they already share a room with (Primary).
 */
export async function acceptDirectInvite(
  page: Page,
  roomId: string,
  { known = false }: { known?: boolean } = {}
): Promise<void> {
  await openInviteSection(page, known);
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await page.waitForURL(
    (url) => decodeURIComponent(url.pathname).replace(/\/$/, '') === `/home/${roomId}`
  );
  await expect(page.locator('[data-editable-name="RoomInput"]')).toBeVisible();
}

/**
 * Accepts the pending invite to the room `roomName` and opens it from the sidebar. The inviter
 * is listed under Public unless the two already share a room (a run that failed to leave one),
 * then under Primary.
 */
export async function acceptRoomInvite(page: Page, roomName: string): Promise<void> {
  const accept = page.getByRole('button', { name: 'Accept', exact: true });
  await openInviteSection(page, false);
  if (!(await accept.isVisible({ timeout: 3000 }).catch(() => false))) {
    await page.getByRole('button', { name: /^Primary\b/ }).click();
  }
  await expect(page.getByText(roomName, { exact: true })).toBeVisible();
  await accept.first().click();
  await page.getByRole('link', { name: roomName }).first().click();
}

/** Sends a message through the composer of the open room and returns its event ID. */
export async function sendMessage(page: Page, text: string): Promise<string> {
  const editor = page.locator('[data-editable-name="RoomInput"]');
  await editor.fill(text);
  await editor.press('Enter');
  const message = page
    .getByText(text, { exact: true })
    .locator('xpath=ancestor::*[@data-message-id][1]');
  await expect.poll(() => message.getAttribute('data-message-id')).toMatch(/^\$/);
  const eventId = await message.getAttribute('data-message-id');
  if (!eventId) throw new Error('Missing sent event ID');
  return eventId;
}

/** Leaves and forgets rooms, so a shared test account does not pile them up. */
export async function leaveRooms(page: Page, roomIds: string[]): Promise<void> {
  for (const roomId of roomIds) {
    const path = `/rooms/${encodeURIComponent(roomId)}`;
    await matrixRequest(page, { method: 'POST', path: `${path}/leave`, body: {} });
    await matrixRequest(page, { method: 'POST', path: `${path}/forget`, body: {} });
  }
}

/**
 * Declines a pending invite as the invited person. The inviter cannot take it back: in a direct
 * message on version 12 the invited person is a creator, whom nobody can kick, and leaving
 * leaves the invite in their list for the rest of the run.
 */
export async function declineInvite(
  browser: Browser,
  credentials: Credentials,
  roomId: string
): Promise<void> {
  const invited = await signIn(browser, credentials);
  try {
    await leaveRooms(invited, [roomId]);
  } finally {
    await invited.context().close();
  }
}

/** Sends an invite from the room's menu; what follows depends on the room. */
export async function invite(page: Page, userId: string): Promise<void> {
  await page.getByRole('banner').getByRole('button', { name: 'More Options', exact: true }).click();
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  const userIdInput = page.locator('input[name="userIdInput"]');
  await userIdInput.fill(userId);
  await page
    .locator('form', { has: userIdInput })
    .getByRole('button', { name: 'Invite', exact: true })
    .click();
}

/** Client-side navigation to Home with no room open, so this person reads nothing. */
export const openHome = (page: Page) =>
  page.evaluate(() => {
    window.history.pushState(null, '', '/home/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

export const roomPath = (roomId: string) => `/rooms/${encodeURIComponent(roomId)}`;

export const joinedMembers = async (page: Page, roomId: string): Promise<string[]> =>
  Object.keys(
    (
      await matrixRequest<{ joined: object }>(page, {
        method: 'GET',
        path: `${roomPath(roomId)}/joined_members`,
      })
    )?.joined ?? {}
  ).sort();

/**
 * The chat the invitee lands in after an invite from a one-to-one chat: opened for us, the
 * original left alone.
 */
export async function inviteFromOneToOne(
  page: Page,
  dmId: string,
  userId: string
): Promise<string> {
  await invite(page, userId);
  await expect.poll(() => currentRoomId(page)).not.toBe(dmId);
  const groupId = currentRoomId(page);
  await page.keyboard.press('Escape');
  return groupId;
}

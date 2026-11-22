import { expect, type Locator, type Page } from '@playwright/test';
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
  await page.goto('/inbox/invites/');
  await page.getByRole('button', { name: known ? /^Primary\b/ : /^Public\b/ }).click();
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await page.waitForURL(
    (url) => decodeURIComponent(url.pathname).replace(/\/$/, '') === `/home/${roomId}`
  );
  await expect(page.locator('[data-editable-name="RoomInput"]')).toBeVisible();
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

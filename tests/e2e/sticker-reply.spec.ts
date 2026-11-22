import { expect, test, type Page } from '@playwright/test';
import { solidPng } from './support/images';
import { matrixRequest, uploadMedia } from './support/matrix';
import { createRoom, leaveRooms, sendMessage } from './support/rooms';

/** A sticker pack in the room's state, as a room's own pack is shared. */
async function addRoomStickerPack(page: Page, roomId: string): Promise<void> {
  const url = await uploadMedia(page, {
    bytes: await solidPng(page, '#c0392b'),
    contentType: 'image/png',
    filename: 'gadsen.png',
  });
  await matrixRequest(page, {
    method: 'PUT',
    path: `/rooms/${encodeURIComponent(roomId)}/state/im.ponies.room_emotes/e2e`,
    body: {
      pack: { display_name: 'e2e stickers', usage: ['sticker'] },
      images: { gadsen: { url, body: 'gadsen', info: { w: 64, h: 64, mimetype: 'image/png' } } },
    },
  });
}

test('renders a sticker as a reply to the selected message', async ({ page }) => {
  const roomId = await createRoom(page, { name: `sticker e2e ${Date.now()}` });

  try {
    await addRoomStickerPack(page, roomId);

    const marker = `sticker reply e2e ${Date.now()}`;
    const targetEventId = await sendMessage(page, marker);
    const targetItem = page.locator(`[data-message-id="${targetEventId}"]`);

    await targetItem.hover();
    await targetItem.locator('button[data-event-id]').first().click();
    await expect(page.getByText(marker, { exact: true })).toHaveCount(2);

    await page.getByRole('button', { name: 'Open sticker picker' }).click();
    const stickerResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        /\/send\/m\.sticker\//.test(decodeURIComponent(response.url())),
      { timeout: 30_000 }
    );
    await page.getByRole('button', { name: 'gadsen emoji' }).click();

    const stickerResponse = await stickerResponsePromise;
    expect(stickerResponse.ok()).toBe(true);
    const stickerContent = stickerResponse.request().postDataJSON();
    expect(stickerContent['m.relates_to']?.['m.in_reply_to']?.event_id).toBe(targetEventId);
    const stickerEventId = ((await stickerResponse.json()) as { event_id?: string }).event_id;

    const stickerItem = page
      .locator('[data-message-id]')
      .filter({ has: page.locator('img[alt="gadsen"]') })
      .filter({ hasText: marker })
      .last();
    await expect(stickerItem).toBeVisible();
    await expect(stickerItem.locator('img[alt="gadsen"]')).toBeVisible();
    await expect(stickerItem).toContainText(marker);
    await expect.poll(() => stickerItem.getAttribute('data-message-id')).toMatch(/^\$/);
    expect(await stickerItem.getAttribute('data-message-id')).toBe(stickerEventId);
  } finally {
    await leaveRooms(page, [roomId]);
  }
});

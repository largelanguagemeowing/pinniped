import { expect, Page, test } from '@playwright/test';
import { ownUserId } from './support/auth';
import { matrixRequest } from './support/matrix';
import { createRoom, leaveRooms, sendMessage } from './support/rooms';
const INDEX_TYPE = 'org.matrix.msc4438.bookmarks.index';
const ITEM_PREFIX = 'org.matrix.msc4438.bookmark.';

type Index = { revision: number; bookmark_ids: string[] };
type Item = { room_id: string; event_id: string; deleted?: boolean };

const userPath = async (page: Page) =>
  `/user/${encodeURIComponent(await ownUserId(page))}/account_data`;

const readIndex = async (page: Page): Promise<Index | undefined> =>
  matrixRequest<Index>(page, {
    method: 'GET',
    path: `${await userPath(page)}/${INDEX_TYPE}`,
    allowNotFound: true,
  });

const readItem = async (page: Page, id: string): Promise<Item | undefined> =>
  matrixRequest<Item>(page, {
    method: 'GET',
    path: `${await userPath(page)}/${encodeURIComponent(ITEM_PREFIX + id)}`,
    allowNotFound: true,
  });

/** IDs in the index whose item points at the event. */
const bookmarkIdsOf = async (page: Page, eventId: string): Promise<string[]> => {
  const index = await readIndex(page);
  const items = await Promise.all(
    (index?.bookmark_ids ?? []).map(async (id) => [id, await readItem(page, id)] as const)
  );
  return items.filter(([, item]) => item?.event_id === eventId).map(([id]) => id);
};

const isAccountDataPut = (url: string, type: string) =>
  decodeURIComponent(url).endsWith(`/account_data/${type}`);

test('bookmarks a message privately and lists it in the room header', async ({ page }) => {
  const roomId = await createRoom(page, { name: `bookmarks e2e ${Date.now()}` });
  let eventId: string | undefined;

  try {
    const marker = `bookmark e2e ${Date.now()}`;
    eventId = await sendMessage(page, marker);

    // bookmark from the context menu
    await page.getByText(marker, { exact: true }).click({ button: 'right' });
    const added = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && isAccountDataPut(r.url(), INDEX_TYPE)
    );
    await page.getByRole('button', { name: 'Bookmark Message' }).click();
    expect((await added).ok()).toBe(true);

    const [bookmarkId] = await bookmarkIdsOf(page, eventId);
    expect(bookmarkId).toBeTruthy();
    expect(await readItem(page, bookmarkId)).toMatchObject({
      room_id: roomId,
      event_id: eventId,
      body_preview: marker,
    });

    // it is account data on the server, so a fresh load still has it
    await page.reload();
    await expect(page.getByText(marker, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Bookmarks', exact: true }).click();
    await expect(page.getByText(marker, { exact: true })).toHaveCount(2);

    const removed = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && isAccountDataPut(r.url(), INDEX_TYPE)
    );
    await page.getByRole('button', { name: 'Remove Bookmark' }).click();
    expect((await removed).ok()).toBe(true);
    await expect(page.getByText('No Bookmarks')).toBeVisible();
    await expect(page.getByText(marker, { exact: true })).toHaveCount(1);

    expect(await bookmarkIdsOf(page, eventId)).toEqual([]);
    await expect.poll(async () => (await readItem(page, bookmarkId))?.deleted).toBe(true);
  } finally {
    if (eventId) {
      const leftover = await bookmarkIdsOf(page, eventId);
      const index = await readIndex(page);
      if (leftover.length > 0 && index) {
        await matrixRequest(page, {
          method: 'PUT',
          path: `${await userPath(page)}/${INDEX_TYPE}`,
          body: {
            ...index,
            revision: index.revision + 1,
            updated_ts: Date.now(),
            bookmark_ids: index.bookmark_ids.filter((id) => !leftover.includes(id)),
          },
        });
      }
    }
    await leaveRooms(page, [roomId]);
  }
});

import { expect, test, type Page } from '@playwright/test';
import { matrixRequest } from './support/matrix';

// room version 12, so it has creators
const V12_ROOM_ID = '!SSZyjqjwolfGYGY6z-4HW4bmdhIW6vnZSN1qgLzxlH0';
// pre-12, so nobody is a creator
const LEGACY_ROOM_PATH = '%23test%3Astablecat.club/!pFxmCvJLPLEicHDuJi%3Astablecat.club';

type StateEvent = { type: string; sender: string; content: Record<string, unknown> };

const joinedCreators = async (page: Page, roomId: string): Promise<string[]> => {
  const path = `/rooms/${encodeURIComponent(roomId)}`;
  const state = await matrixRequest<StateEvent[]>(page, { method: 'GET', path: `${path}/state` });
  const create = state?.find((event) => event.type === 'm.room.create');
  if (!create) throw new Error('Missing m.room.create');
  const additional = create.content.additional_creators;
  const creators = [create.sender, ...(Array.isArray(additional) ? additional : [])];

  const joined = await matrixRequest<{ joined: Record<string, unknown> }>(page, {
    method: 'GET',
    path: `${path}/joined_members`,
  });
  return creators.filter((userId) => userId in (joined?.joined ?? {})).sort();
};

const crownedUserIds = (page: Page) =>
  page
    .locator('[data-user-id]')
    .filter({ has: page.getByLabel('Founder', { exact: true }) })
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-user-id') ?? '').sort());

test('crowns the room creators in the member list', async ({ page }) => {
  await page.goto(`/home/${V12_ROOM_ID}`);
  await expect(page.locator('[data-editable-name="RoomInput"]')).toBeVisible();

  const expected = await joinedCreators(page, V12_ROOM_ID);
  expect(expected.length).toBeGreaterThan(0);
  await expect.poll(() => crownedUserIds(page)).toEqual(expected);
});

test('crowns nobody in a room without creators', async ({ page }) => {
  await page.goto(`/${LEGACY_ROOM_PATH}`);
  await expect(page.locator('[data-editable-name="RoomInput"]')).toBeVisible();
  const ownUserId = await page.evaluate(() => localStorage.getItem('cinny_user_id'));
  await expect(page.locator(`button[data-user-id="${ownUserId}"]`).first()).toBeVisible();

  await expect(page.getByLabel('Founder', { exact: true })).toHaveCount(0);
});

import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { e2eCredentials } from './support/env';
import { matrixRequest } from './support/matrix';
import { createRoom, leaveRooms, roomPath } from './support/rooms';
import { distanceFromBottom, rowTop, seedMessages, withTimelineScroller } from './support/timeline';

// The pinned message is mid-history, several pages from both ends of the room: a jump there loads
// older messages above it while the view is held on it, and must not follow them to the top.
const MESSAGES = 300;
const PINNED_INDEX = 150;
const label = (i: number) => `history ${String(i).padStart(3, '0')}`;
// messages of varying height, as a real room has
const body = (i: number) =>
  `${label(i)}${'\nanother line of text'.repeat([0, 3, 1, 6, 2, 0, 4][i % 7])}`;

let page: Page;
let roomId: string;
let eventIds: string[];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  page = await signIn(browser, e2eCredentials);
  roomId = await createRoom(page, { name: `pinned jump e2e ${Date.now()}` });
  eventIds = await seedMessages(page, roomId, MESSAGES, body);
  await matrixRequest(page, {
    method: 'PUT',
    path: `${roomPath(roomId)}/state/m.room.pinned_events`,
    body: { pinned: [eventIds[PINNED_INDEX]] },
  });
});

test.afterAll(async () => {
  await leaveRooms(page, [roomId]);
  await page.context().close();
});

/** True when the event's row lies fully inside the timeline's viewport. */
const rowInView = (eventId: string): Promise<boolean> =>
  withTimelineScroller(
    page,
    (s, id) => {
      const row = Array.from(s.querySelectorAll<HTMLElement>('[data-message-id]')).find(
        (r) => r.getAttribute('data-message-id') === id
      );
      if (!row) return false;
      const box = s.getBoundingClientRect();
      const rect = row.getBoundingClientRect();
      return rect.top >= box.top && rect.bottom <= box.bottom;
    },
    eventId
  );

test('opening an old pinned message scrolls the timeline to it', async () => {
  test.setTimeout(60_000);
  const pinnedId = eventIds[PINNED_INDEX];

  // start at the newest message, far from the pinned one
  await page.goto('/home/');
  await page.goto(roomPath(roomId));
  await expect(page.getByText(label(MESSAGES - 1))).toBeVisible();
  await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(1);
  expect(await rowTop(page, pinnedId)).toBeNull();

  await page.getByRole('button', { name: 'Pinned Messages', exact: true }).click();
  await expect(page.getByText(new RegExp(`^${label(PINNED_INDEX)}`))).toBeVisible();
  await page.getByRole('button', { name: 'Open', exact: true }).click();

  // the view settles on the message while older ones load above it
  await expect.poll(() => rowInView(pinnedId), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(1_500);

  // it is still in view, the URL names it, and the timeline left the newest messages
  expect(await rowInView(pinnedId)).toBe(true);
  expect(decodeURIComponent(new URL(page.url()).pathname)).toBe(
    decodeURIComponent(`${roomPath(roomId)}/${pinnedId}`)
  );
  await expect(page.getByRole('button', { name: 'Jump to Latest' })).toBeVisible();
  await expect(page.getByText(label(MESSAGES - 1), { exact: true })).toBeHidden();
});

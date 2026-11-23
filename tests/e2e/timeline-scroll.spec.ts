import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { e2eCredentials } from './support/env';
import { createRoom, leaveRooms, roomPath } from './support/rooms';
import {
  distanceFromBottom,
  pointAtTimeline,
  findScrollJumps,
  rowTop,
  scrollTop,
  seedMessages,
  sendMessageViaApi,
  startScrollRecorder,
  stopScrollRecorder,
  visibleRow,
  withTimelineScroller,
} from './support/timeline';

// A room whose history is mostly not in the client: it holds a few pages, so reading back to the
// first message goes through the server several times.
const MESSAGES = 260;
const label = (i: number) => `history ${String(i).padStart(3, '0')}`;
const body = (i: number) => (i % 7 === 0 ? `${label(i)}\nsecond line\nthird line` : label(i));
const FIRST_MESSAGE = /^history 000/;
const LAST_MESSAGE = new RegExp(`^${label(MESSAGES - 1)}`);

test.describe.configure({ mode: 'serial' });

let page: Page;
let roomId: string;
let eventIds: string[];

async function openRoom(path = roomPath(roomId)) {
  await page.goto('/home/');
  await page.goto(path);
  await expect(page.locator('[data-message-item]').first()).toBeVisible();
}

const jumpToLatest = () => page.getByRole('button', { name: 'Jump to Latest' });

/** The room, opened fresh and at its newest message, with the pointer over the timeline. */
async function openAtLatest() {
  await openRoom();
  await expect(page.getByText(LAST_MESSAGE)).toBeVisible();
  await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(1);
  await pointAtTimeline(page);
}

/**
 * Wheels up in steady ticks, as a held trackpad flick does, until `done`. Returns the ms it took;
 * throws when `done` is still false after `limitMs`.
 */
async function wheelUpUntil(done: () => Promise<boolean>, limitMs: number): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < limitMs) {
    await page.mouse.wheel(0, -400);

    await page.waitForTimeout(30);

    if (await done()) return Date.now() - start;
  }
  throw new Error(`still not there after ${limitMs} ms`);
}

const firstMessageVisible = () => page.getByText(FIRST_MESSAGE).isVisible();

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  page = await signIn(browser, e2eCredentials);
  roomId = await createRoom(page, { name: `scroll e2e ${Date.now()}` });
  eventIds = await seedMessages(page, roomId, MESSAGES, body);
});

test.afterAll(async () => {
  await leaveRooms(page, [roomId]);
  await page.context().close();
});

test('a steady wheel flick runs through every page of history without stopping', async () => {
  test.setTimeout(120_000);
  await openAtLatest();
  await startScrollRecorder(page);
  await wheelUpUntil(firstMessageVisible, 60_000);
  const samples = await stopScrollRecorder(page);

  // while the flick runs the position changes in every half second, until the top is reached
  const reached = samples.findIndex((s) => s.scrollTop === 0 && s.rows > 0);
  const moving = samples.slice(0, reached === -1 ? samples.length : reached);
  for (let i = 0; i + 30 < moving.length; i += 30) {
    const window = moving.slice(i, i + 30);
    expect(
      new Set(window.map((s) => Math.round(s.scrollTop))).size,
      `no movement around ${Math.round(window[0].t)} ms`
    ).toBeGreaterThan(1);
  }
  expect(findScrollJumps(samples, { direction: 'up', maxStepPx: 500 })).toEqual([]);
});

// A smooth scroll is an animation in flight, like a trackpad flick or a held PageUp. Setting the
// scroll position from a script ends it, and the reader who settles at the edge of what is loaded
// produces no intersection change that would ask for the next page. Either one leaves the view
// stuck above unloaded history; each showed up in some runs only, hence the repeats.
test('an animated scroll to the top runs through all of the history', async () => {
  test.setTimeout(180_000);
  for (let run = 0; run < 4; run += 1) {
    await openAtLatest();
    await withTimelineScroller(page, (s) => s.scrollTo({ top: 0, behavior: 'smooth' }));
    await expect(page.getByText(FIRST_MESSAGE), `run ${run}`).toBeVisible({ timeout: 15_000 });
  }
});

test('older messages that load while reading do not move what the reader is looking at', async () => {
  test.setTimeout(120_000);
  await openAtLatest();
  const seen = new Map<string, number>();
  // slow reading: short wheel steps with pauses, so every page loads between two steps
  for (let step = 0; step < 400 && !(await firstMessageVisible()); step += 1) {
    const row = await visibleRow(page);
    await page.mouse.wheel(0, -150);
    await page.waitForTimeout(60);
    if (row) {
      seen.set(row.id, row.top);
      const after = await rowTop(page, row.id);
      // the row moved down by the wheel step (150px) and nothing else
      if (after !== null) expect(Math.abs(after - row.top - 150)).toBeLessThanOrEqual(40);
    }
  }
  await expect(page.getByText(FIRST_MESSAGE)).toBeVisible();
  expect(seen.size).toBeGreaterThan(20);
});

test('reaching the top edge before the next page arrives keeps the place', async () => {
  test.setTimeout(120_000);
  await openAtLatest();
  // jump straight to the edge of what is rendered, as a long flick does
  await withTimelineScroller(page, (s) => {
    s.scrollTop = 0;
  });
  const row = await visibleRow(page);
  expect(row).not.toBeNull();
  const before = row!.top;
  await expect.poll(() => scrollTop(page), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1_000);
  const after = await rowTop(page, row!.id);
  expect(after).not.toBeNull();
  expect(Math.abs(after! - before)).toBeLessThanOrEqual(2);
});

test('content that grows above the viewport does not push the reader down', async () => {
  await openAtLatest();
  await page.mouse.wheel(0, -1200);
  await page.waitForTimeout(500);
  const row = await visibleRow(page);
  expect(row).not.toBeNull();
  const before = row!.top;
  // what an image or link preview does when it finishes loading
  await withTimelineScroller(page, (s) => {
    const rows = Array.from(s.querySelectorAll<HTMLElement>('[data-message-item]'));
    const above = rows.filter(
      (r) => r.getBoundingClientRect().bottom < s.getBoundingClientRect().top
    );
    const probe = document.createElement('div');
    probe.style.height = '600px';
    above[above.length - 1].append(probe);
  });
  await page.waitForTimeout(500);
  const after = await rowTop(page, row!.id);
  expect(after).not.toBeNull();
  expect(Math.abs(after! - before)).toBeLessThanOrEqual(2);
});

test('a reader at the bottom stays there when the viewport shrinks and grows', async () => {
  await openAtLatest();
  const { width, height } = page.viewportSize()!;
  // what the read-receipt bar, a taller composer or a resized window does to the timeline's height
  await page.setViewportSize({ width, height: height - 200 });
  await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width, height });
  await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(1);
});

test('a message that arrives while the reader is scrolled up leaves their place alone', async () => {
  await openAtLatest();
  await page.mouse.wheel(0, -1500);
  await page.waitForTimeout(500);
  const row = await visibleRow(page);
  expect(row).not.toBeNull();
  const sent = await sendMessageViaApi(page, roomId, `arrival while reading ${Date.now()}`);
  await expect(jumpToLatest()).toBeVisible();
  await page.waitForTimeout(1_000);
  const after = await rowTop(page, row!.id);
  expect(after).not.toBeNull();
  expect(Math.abs(after! - row!.top)).toBeLessThanOrEqual(2);

  await jumpToLatest().click();
  await expect.poll(() => distanceFromBottom(page), { timeout: 10_000 }).toBeLessThanOrEqual(1);
  await expect(page.locator(`[data-message-id="${sent}"]`)).toBeVisible();
});

for (const from of ['the first message', 'the middle of history', 'a flick in progress']) {
  test(`Jump to Latest from ${from} lands on the newest message and stays there`, async () => {
    test.setTimeout(120_000);
    await openAtLatest();
    if (from === 'the first message') {
      await wheelUpUntil(firstMessageVisible, 60_000);
    } else if (from === 'the middle of history') {
      await wheelUpUntil(async () => !(await page.getByText(LAST_MESSAGE).isVisible()), 30_000);
      await wheelUpUntil(async () => (await scrollTop(page)) < 200, 30_000);
    } else {
      await startScrollRecorder(page);
      await wheelUpUntil(async () => await jumpToLatest().isVisible(), 30_000);
    }

    await expect(jumpToLatest()).toBeVisible();
    await jumpToLatest().click();
    await expect.poll(() => distanceFromBottom(page), { timeout: 10_000 }).toBeLessThanOrEqual(1);
    await expect(page.getByText(LAST_MESSAGE)).toBeVisible();
    // it stays: later layout (decryption, images, the window settling) must not pull it away
    for (let i = 0; i < 10; i += 1) {
      await page.waitForTimeout(200);

      expect(await distanceFromBottom(page)).toBeLessThanOrEqual(1);
    }
    await expect(jumpToLatest()).toBeHidden({ timeout: 5_000 });
  });
}

test('Jump to Latest works again and again', async () => {
  test.setTimeout(120_000);
  await openAtLatest();
  for (let round = 0; round < 4; round += 1) {
    await wheelUpUntil(
      async () => (await scrollTop(page)) < 1_000 || (await jumpToLatest().isVisible()),
      30_000
    );

    await expect(jumpToLatest()).toBeVisible();

    await jumpToLatest().click();

    await expect
      .poll(() => distanceFromBottom(page), { timeout: 10_000, message: `round ${round}` })
      .toBeLessThanOrEqual(1);
  }
});

test('Jump to Latest from an opened old message', async () => {
  await openRoom(`${roomPath(roomId)}/${encodeURIComponent(eventIds[12])}`);
  await expect(page.getByText(label(12), { exact: false }).first()).toBeVisible();
  await jumpToLatest().click();
  await expect.poll(() => distanceFromBottom(page), { timeout: 10_000 }).toBeLessThanOrEqual(1);
  await expect(page.getByText(LAST_MESSAGE)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(roomPath(roomId));
});

import { expect, test, type Page } from '@playwright/test';
import { createRoom, leaveRooms, sendMessage } from './support/rooms';

async function getDistanceFromBottom(page: Page): Promise<number> {
  return page
    .locator('[data-message-item]')
    .last()
    .evaluate((message) => {
      let scrollElement = message.parentElement;
      while (scrollElement && getComputedStyle(scrollElement).overflowY !== 'scroll') {
        scrollElement = scrollElement.parentElement;
      }
      if (!scrollElement) throw new Error('Timeline scroll element not found');

      return scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;
    });
}

test('keeps following the timeline when content grows asynchronously', async ({ page }) => {
  const roomId = await createRoom(page, { name: `auto-follow e2e ${Date.now()}` });
  try {
    for (let i = 0; i < 3; i += 1) await sendMessage(page, `auto-follow e2e message ${i}`);

    const lastMessage = page.locator('[data-message-item]').last();
    await expect(lastMessage).toBeVisible();

    await lastMessage.evaluate((message) => {
      const resizeProbe = document.createElement('div');
      resizeProbe.dataset.autoFollowResizeProbe = 'true';
      resizeProbe.style.height = '800px';
      message.append(resizeProbe);

      let scrollElement = message.parentElement;
      while (scrollElement && getComputedStyle(scrollElement).overflowY !== 'scroll') {
        scrollElement = scrollElement.parentElement;
      }
      if (!scrollElement) throw new Error('Timeline scroll element not found');
      scrollElement.scrollTop = scrollElement.scrollHeight;
    });

    await expect.poll(() => getDistanceFromBottom(page)).toBeLessThanOrEqual(1);
    await page.waitForTimeout(1_500);

    await lastMessage.evaluate((message) => {
      const resizeProbe = message.querySelector('[data-auto-follow-resize-probe]');
      if (!(resizeProbe instanceof HTMLElement)) throw new Error('Resize probe not found');
      resizeProbe.style.height = '1400px';
    });

    await expect.poll(() => getDistanceFromBottom(page), { timeout: 5_000 }).toBeLessThanOrEqual(1);
  } finally {
    await leaveRooms(page, [roomId]);
  }
});

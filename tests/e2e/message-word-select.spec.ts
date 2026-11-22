import { expect, test, type Page } from '@playwright/test';
import { createRoom, leaveRooms, sendMessage } from './support/rooms';

/** Viewport point at the middle of `word` inside the message whose text is `text`. */
async function wordPoint(page: Page, text: string, word: string) {
  return page.getByText(text, { exact: true }).evaluate((el, target) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(target) ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + target.length);
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    throw new Error(`"${target}" not found in message`);
  }, word);
}

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const upper = 'upper alpha bravo';
const lower = 'lower charlie delta';

test('double-clicking a word in a message selects and copies only that word', async ({ page }) => {
  const roomId = await createRoom(page, { name: `word select e2e ${Date.now()}` });
  try {
    await sendMessage(page, upper);
    await sendMessage(page, lower);

    // first, middle and last word; the last one is where a range tends to run on into the next row
    for (const word of ['upper', 'alpha', 'bravo']) {
      await page.evaluate(() => window.getSelection()?.removeAllRanges());
      const { x, y } = await wordPoint(page, upper, word);
      await page.mouse.dblclick(x, y);

      await expect
        .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
        .toBe(word);

      await page.keyboard.press('ControlOrMeta+C');
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied.trim(), `copied after double-clicking "${word}"`).toBe(word);
      expect(copied).not.toContain('lower');
    }
  } finally {
    await leaveRooms(page, [roomId]);
  }
});

test('double-clicking beside a short message does not copy the message below', async ({ page }) => {
  const roomId = await createRoom(page, { name: `blank select e2e ${Date.now()}` });
  try {
    await sendMessage(page, upper);
    await sendMessage(page, lower);

    // the blank space after the text, still inside the message row
    const row = await page.locator('[data-message-item]').filter({ hasText: upper }).boundingBox();
    const text = await page.getByText(upper, { exact: true }).boundingBox();
    if (!row || !text) throw new Error('Message not laid out');
    await page.mouse.dblclick(row.x + row.width - 100, text.y + text.height / 2);

    await page.keyboard.press('ControlOrMeta+C');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).not.toContain('lower');
    expect(copied).not.toContain(upper);
  } finally {
    await leaveRooms(page, [roomId]);
  }
});

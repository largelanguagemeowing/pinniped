import { expect, test, type Locator, type Page } from '@playwright/test';
import { ownUserId } from './support/auth';
import { createRoom, leaveRooms } from './support/rooms';

let roomId: string;
test.beforeEach(async ({ page }) => {
  roomId = await createRoom(page, { name: `mention e2e ${Date.now()}` });
});
test.afterEach(async ({ page }) => {
  await leaveRooms(page, [roomId]);
});

type Accept = (page: Page, editor: Locator, item: Locator) => Promise<void>;

const accepts: Record<string, Accept> = {
  click: async (_page, _editor, item) => {
    await item.click();
  },
  'arrow down and enter': async (page, editor) => {
    await editor.press('ArrowDown');
    await page.keyboard.press('Enter');
  },
  tab: async (_page, editor) => {
    await editor.press('Tab');
  },
};

const openMentionMenu = async (page: Page) => {
  const editor = page.locator('[data-editable-name="RoomInput"]');
  await expect(editor).toBeVisible();
  const userId = await ownUserId(page);
  const localpart = userId.slice(1, userId.indexOf(':'));

  await editor.click();
  await editor.pressSequentially(`hi @${localpart}`);
  const item = page.getByRole('button').filter({ hasText: userId }).first();
  await expect(item).toBeVisible();
  return { editor, item, localpart };
};

const clearEditor = async (editor: Locator) => {
  await editor.press('ControlOrMeta+a');
  await editor.press('Backspace');
};

for (const [name, accept] of Object.entries(accepts)) {
  test(`keeps the caret after a mention accepted with ${name}`, async ({ page }) => {
    const { editor, item } = await openMentionMenu(page);
    try {
      await accept(page, editor, item);
      await expect(item).toBeHidden();
      await page.keyboard.type('X');

      await expect(editor).toHaveText(/^hi\s.*@.+\sX$/);
    } finally {
      await clearEditor(editor);
    }
  });
}

test('closes the mention menu on escape and keeps the caret', async ({ page }) => {
  const { editor, item, localpart } = await openMentionMenu(page);
  try {
    await page.keyboard.press('Escape');
    await expect(item).toBeHidden();
    await page.keyboard.type('X');

    await expect(editor).toHaveText(`hi @${localpart}X`);
  } finally {
    await clearEditor(editor);
  }
});

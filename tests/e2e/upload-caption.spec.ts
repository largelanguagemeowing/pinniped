import { expect, test } from '@playwright/test';
import { createRoom, leaveRooms } from './support/rooms';

test('Enter while a file is still uploading waits, then sends the file with its caption', async ({
  page,
}) => {
  const roomId = await createRoom(page, { name: `upload e2e ${Date.now()}` });
  const caption = `caption ${Date.now()}`;

  // the server answers the upload only when this test lets it
  let releaseUpload: () => void = () => undefined;
  const uploadMayFinish = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  await page.route(/\/_matrix\/(client|media)\/.*\/upload/, async (route) => {
    await uploadMayFinish;
    await route.continue();
  });

  try {
    await page.getByRole('button', { name: 'Attach', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload a File', exact: true }).click();
    await (
      await chooser
    ).setFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('some notes'),
    });

    const editor = page.locator('[data-editable-name="RoomInput"]');
    await editor.click();
    await page.keyboard.type(caption);
    await page.keyboard.press('Enter');

    // nothing went out, and the caption is still there to send with the file
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-message-id]').filter({ hasText: caption })).toHaveCount(0);
    await expect(editor).toContainText(caption);

    releaseUpload();
    const message = page.locator('[data-message-id]').filter({ hasText: 'notes.txt' });
    await expect(page.getByText('notes.txt').first()).toBeVisible();
    // the upload board shows the file as done; the same Enter now sends both
    await expect
      .poll(async () => {
        await page.keyboard.press('Enter');
        return message.count();
      })
      .toBe(1);
    await expect(message).toContainText(caption);
  } finally {
    await leaveRooms(page, [roomId]);
  }
});

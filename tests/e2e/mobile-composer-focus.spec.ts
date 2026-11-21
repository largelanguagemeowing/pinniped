import { devices, expect, test } from '@playwright/test';
import { createRoom, leaveRooms } from './support/rooms';

test.use({ ...devices['Pixel 5'] });

test('keeps the mobile composer focused while sending', async ({ page }) => {
  const roomId = await createRoom(page, { name: `mobile composer e2e ${Date.now()}` });

  try {
    const editor = page.locator('[data-editable-name="RoomInput"]');
    await expect(editor).toBeVisible();
    await editor.click();
    await editor.pressSequentially('mobile composer focus test');

    await editor.evaluate((element) => {
      element.setAttribute('data-blur-count', '0');
      element.addEventListener('blur', () => {
        const blurCount = Number(element.getAttribute('data-blur-count'));
        element.setAttribute('data-blur-count', String(blurCount + 1));
      });
    });

    const sendResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        /\/send\/m\.room\.message\//.test(decodeURIComponent(response.url()))
    );
    const composer = editor.locator('xpath=ancestor::div[.//button][1]');
    const sendButton = composer.locator('button').last();
    await sendButton.tap();

    await expect(editor).not.toContainText('mobile composer focus test');
    await expect(editor).toBeFocused();
    await expect(editor).toHaveAttribute('data-blur-count', '0');

    const sendResponse = await sendResponsePromise;
    expect(sendResponse.ok()).toBe(true);
  } finally {
    await leaveRooms(page, [roomId]);
  }
});

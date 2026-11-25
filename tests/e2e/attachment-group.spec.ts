import { expect, test } from '@playwright/test';
import { matrixRequest, redactEvent, uploadMedia } from './support/matrix';
import { createRoom, leaveRooms, roomPath } from './support/rooms';

// what Pinniped tags the files of one message with; other clients show them one by one
const ATTACHMENTS_KEY = 'club.stablecat.pinniped.attachments';

test('deleting the first file of a multi-file message keeps the others', async ({ page }) => {
  const roomId = await createRoom(page, { name: `attachments e2e ${Date.now()}` });
  const group = `group${Date.now()}`;

  try {
    const eventIds: string[] = [];
    for (const name of ['first.txt', 'second.txt', 'third.txt']) {
      const bytes = Array.from(Buffer.from(`contents of ${name}`));
      const url = await uploadMedia(page, { bytes, contentType: 'text/plain', filename: name });
      const result = await matrixRequest<{ event_id: string }>(page, {
        method: 'PUT',
        path: `/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${Date.now()}-${name}`,
        body: {
          msgtype: 'm.file',
          body: name,
          url,
          info: { mimetype: 'text/plain', size: bytes.length },
          [ATTACHMENTS_KEY]: group,
        },
      });
      eventIds.push(result!.event_id);
    }
    await redactEvent(page, roomId, eventIds[0]);

    await page.goto(roomPath(roomId));
    await expect(page.getByText('second.txt').first()).toBeVisible();
    await expect(page.getByText('third.txt').first()).toBeVisible();
  } finally {
    await leaveRooms(page, [roomId]);
  }
});

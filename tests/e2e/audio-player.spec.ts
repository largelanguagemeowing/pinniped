import { expect, test } from '@playwright/test';
import { matrixRequest, uploadMedia } from './support/matrix';
import { createRoom, leaveRooms } from './support/rooms';
const AUDIO_DURATION_SECONDS = 4;

const createSilentWav = (): number[] => {
  const sampleRate = 8000;
  const sampleCount = sampleRate * AUDIO_DURATION_SECONDS;
  const dataSize = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);

  return Array.from(wav);
};

test('audio timeline supports pointer and keyboard seeking', async ({ page }) => {
  const roomId = await createRoom(page, { name: `audio e2e ${Date.now()}` });

  try {
    // an audio message with a known duration, as another client would send it
    const audioBytes = createSilentWav();
    const contentUri = await uploadMedia(page, {
      bytes: audioBytes,
      contentType: 'audio/wav',
      filename: 'scrub-test.wav',
    });

    const result = await matrixRequest<{ event_id: string }>(page, {
      method: 'PUT',
      path: `/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${Date.now()}`,
      body: {
        msgtype: 'm.audio',
        body: 'Audio scrubber test',
        url: contentUri,
        info: {
          duration: AUDIO_DURATION_SECONDS * 1000,
          mimetype: 'audio/wav',
          size: audioBytes.length,
        },
      },
    });
    const eventId = result?.event_id;
    if (!eventId) throw new Error('Missing sent event ID');

    const message = page.locator(`[data-message-id="${eventId}"]`);
    await expect(message).toBeVisible();

    const audio = message.locator('audio');
    const seekSlider = message.getByRole('slider', { name: 'Seek audio' });
    const volumeSlider = message.getByRole('slider', { name: 'Volume' });
    const seekBar = message.getByTestId('audio-seek-bar');
    const volumeBar = message.getByTestId('audio-volume-bar');

    const [seekThumbBox, seekBarBox, volumeThumbBox, volumeBarBox] = await Promise.all([
      seekSlider.boundingBox(),
      seekBar.boundingBox(),
      volumeSlider.boundingBox(),
      volumeBar.boundingBox(),
    ]);
    if (!seekThumbBox || !seekBarBox || !volumeThumbBox || !volumeBarBox) {
      throw new Error('Audio controls have no layout box');
    }

    const centerY = (box: { y: number; height: number }) => box.y + box.height / 2;
    expect(Math.abs(centerY(seekThumbBox) - centerY(seekBarBox))).toBeLessThanOrEqual(1);
    expect(Math.abs(centerY(volumeThumbBox) - centerY(volumeBarBox))).toBeLessThanOrEqual(1);

    await audio.evaluate((element) => {
      let mockedCurrentTime = 0;
      Object.defineProperty(element, 'currentTime', {
        configurable: true,
        get: () => mockedCurrentTime,
        set: (value: number) => {
          mockedCurrentTime = value;
        },
      });
    });

    const seekTrack = seekSlider.locator('..');
    const thumbBox = await seekSlider.boundingBox();
    const trackBox = await seekTrack.boundingBox();
    if (!thumbBox || !trackBox) throw new Error('Audio seek control has no layout box');

    await page.mouse.move(thumbBox.x + thumbBox.width / 2, thumbBox.y + thumbBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(trackBox.x + trackBox.width * 0.75, trackBox.y + trackBox.height / 2);

    await expect
      .poll(async () => Number(await seekSlider.getAttribute('aria-valuenow')))
      .toBeGreaterThan(2);
    await expect
      .poll(() => audio.evaluate((element: HTMLMediaElement) => element.currentTime))
      .toBeGreaterThan(2);
    await page.mouse.up();

    await seekSlider.focus();
    const beforeKeyboardSeek = await audio.evaluate(
      (element: HTMLMediaElement) => element.currentTime
    );
    await seekSlider.press('ArrowLeft');
    await expect
      .poll(() => audio.evaluate((element: HTMLMediaElement) => element.currentTime))
      .toBeLessThan(beforeKeyboardSeek);
  } finally {
    await leaveRooms(page, [roomId]);
  }
});

import { expect, test, type Page } from '@playwright/test';
import { loginWithTestAccount } from './support/auth';
import { createRoom, leaveRooms } from './support/rooms';

test.use({
  storageState: { cookies: [], origins: [] },
  permissions: ['microphone', 'camera'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

// Remembers every microphone track the page opens, to read what the browser was asked for.
// Chromium's fake microphone always reports `echoCancellation: false` in its settings, so the
// request itself (`getConstraints`) is what shows the setting.
const recordMicrophones = () => {
  const tracks: MediaStreamTrack[] = [];
  (window as unknown as { __mics: MediaStreamTrack[] }).__mics = tracks;
  const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const stream = await getUserMedia(constraints);
    tracks.push(...stream.getAudioTracks());
    return stream;
  };
};

// The call's microphone is the newest audio track still live.
const liveMicrophoneEchoCancellation = (page: Page): Promise<unknown> =>
  page.evaluate(() => {
    const tracks = (window as unknown as { __mics: MediaStreamTrack[] }).__mics;
    const live = tracks.filter((t) => t.readyState === 'live');
    return live.at(-1)?.getConstraints().echoCancellation;
  });

const echoSwitch = (page: Page) =>
  page.getByText('Echo Cancellation', { exact: true }).locator('xpath=../..').getByRole('switch');

test('the call microphone has echo cancellation off, until the setting turns it on', async ({
  page,
}) => {
  await page.addInitScript(recordMicrophones);
  await loginWithTestAccount(page);
  const roomId = await createRoom(page, { name: `echo ${Date.now()}`, voice: true });
  try {
    await page.getByRole('button', { name: 'Join Voice', exact: true }).click();
    await expect(page.getByText('Voice Connected', { exact: true })).toBeVisible();
    await expect.poll(() => liveMicrophoneEchoCancellation(page)).toBe(false);

    // changing the setting mid-call re-constrains the live microphone
    await page.getByRole('button', { name: 'User Settings' }).click();
    await page.getByText('Calls', { exact: true }).click();
    await expect(echoSwitch(page)).not.toBeChecked();
    await echoSwitch(page).click();
    await expect.poll(() => liveMicrophoneEchoCancellation(page)).toBe(true);

    await echoSwitch(page).click();
    await expect.poll(() => liveMicrophoneEchoCancellation(page)).toBe(false);
    await page.keyboard.press('Escape');
  } finally {
    await page
      .getByRole('button', { name: 'Disconnect', exact: true })
      .click({ timeout: 3000 })
      .catch(() => undefined);
    await leaveRooms(page, [roomId]);
  }
});

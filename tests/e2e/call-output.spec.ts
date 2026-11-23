import { expect, test, type Page } from '@playwright/test';
import { loginWithTestAccount } from './support/auth';
import { disconnectQuietly, fakeMedia, joinVoice } from './support/calls';
import { createRoom, leaveRooms } from './support/rooms';

test.use(fakeMedia());

// Chromium can leave an audio context with a stopped clock ("running", but nothing plays) when
// two `setSinkId` calls overlap while it starts. The call's playback context is the one on a
// named output; LiveKit's silent analysis contexts have no output stream (a `sinkId` object).
const recordContexts = () => {
  const Base = window.AudioContext;
  const made: AudioContext[] = [];
  (window as unknown as { __contexts: AudioContext[] }).__contexts = made;
  window.AudioContext = class extends Base {
    constructor(options?: AudioContextOptions) {
      super(options);
      made.push(this);
    }
  };
};

const playbackTime = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const made = (window as unknown as { __contexts: (AudioContext & { sinkId: unknown })[] })
      .__contexts;
    const playback = made.find((c) => typeof c.sinkId === 'string' && c.state === 'running');
    return playback?.currentTime ?? -1;
  });

test("the call's audio output is playing", async ({ page }) => {
  await page.addInitScript(recordContexts);
  await loginWithTestAccount(page);
  const roomId = await createRoom(page, { name: `output ${Date.now()}`, voice: true });
  try {
    await joinVoice(page);

    // a context whose clock stands still plays nothing
    await expect.poll(() => playbackTime(page)).toBeGreaterThan(0);
    const before = await playbackTime(page);
    await page.waitForTimeout(1500);
    expect(await playbackTime(page)).toBeGreaterThan(before + 1);
  } finally {
    await disconnectQuietly(page);
    await leaveRooms(page, [roomId]);
  }
});

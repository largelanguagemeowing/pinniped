import { expect, test, type Page } from '@playwright/test';
import { loginWithTestAccount, ownUserId, signIn } from './support/auth';
import { fakeMedia, inviteToCall, joinVoice, tearDownRoom } from './support/calls';
import { peerCredentials } from './support/env';
import { acceptRoomInvite, createRoom } from './support/rooms';

test.use(fakeMedia());
test.skip(!process.env.E2E_PEER_USERNAME, 'needs a second account (E2E_PEER_USERNAME)');

const tileOf = (page: Page, userId: string) =>
  page.locator(`[data-pinniped-user-id=${JSON.stringify(userId)}]`).first();

/**
 * Makes every remote camera undecryptable for this page while audio keeps working: the E2EE
 * worker is told that video tracks belong to a participant it holds no key for, which is what
 * a camera sent on a key we never received looks like. The worker cryptor must be enabled for
 * that identity or it would pass the frames through undecrypted, and the worker's replies name
 * the real participant again so that LiveKit attributes the failures to them.
 */
const holdNoKeyForVideo = (page: Page) =>
  page.addInitScript(() => {
    const suffix = '#video';
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, message: unknown, ...rest: never[]) {
      const m = message as {
        kind?: string;
        data?: { codec?: string; participantIdentity?: string };
      };
      if (m?.kind === 'decode' && m.data?.codec && m.data.participantIdentity) {
        const identity = m.data.participantIdentity + suffix;
        post.call(this, { kind: 'enable', data: { enabled: true, participantIdentity: identity } });
        m.data.participantIdentity = identity;
      }
      return post.call(this, message, ...rest);
    } as typeof Worker.prototype.postMessage;

    const onmessage = Object.getOwnPropertyDescriptor(Worker.prototype, 'onmessage');
    if (!onmessage?.set || !onmessage.get) throw new Error('Worker.onmessage is not an accessor');
    Object.defineProperty(Worker.prototype, 'onmessage', {
      configurable: true,
      get: onmessage.get,
      set(this: Worker, handler: ((ev: MessageEvent) => void) | null) {
        onmessage.set!.call(
          this,
          handler &&
            ((ev: MessageEvent) => {
              const data = ev.data?.data as { participantIdentity?: string } | undefined;
              if (data?.participantIdentity?.endsWith(suffix))
                data.participantIdentity = data.participantIdentity.slice(0, -suffix.length);
              handler.call(this, ev);
            })
        );
      },
    });
  });

test('a participant whose camera cannot be decrypted stays marked while their audio plays', async ({
  page,
  browser,
}) => {
  const roomName = `camera key e2e ${Date.now()}`;
  let peer: Page | undefined;
  let roomId: string | undefined;

  try {
    await holdNoKeyForVideo(page);
    await loginWithTestAccount(page);
    peer = await signIn(browser, peerCredentials());
    const peerId = await ownUserId(peer);

    roomId = await createRoom(page, { name: roomName, voice: true, encrypted: true });
    await joinVoice(page);
    await inviteToCall(page, peerId);
    await acceptRoomInvite(peer, roomName);
    await expect(peer.getByText('Voice Connected', { exact: true })).toBeVisible();

    const tile = tileOf(page, peerId);
    const marker = tile.locator('[data-pinniped-undecryptable]');
    await expect(tile).toHaveAttribute('data-pinniped-speaking', 'true');
    await expect(marker).toHaveCount(0);

    await peer.getByRole('button', { name: 'Start Camera', exact: true }).first().click();
    await expect(marker).toBeVisible();

    // The failure is reported once; later samples show their audio decoding. The marker must
    // outlast several of them instead of clearing, with the audio still playing.
    for (let second = 0; second < 8; second++) {
      await expect(marker).toBeVisible({ timeout: 100 });
      await page.waitForTimeout(1000);
    }
    await expect(tile).toHaveAttribute('data-pinniped-speaking', 'true');
  } finally {
    await tearDownRoom(roomId, page, peer ? [peer] : []);
  }
});

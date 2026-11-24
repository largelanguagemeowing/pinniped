import { expect, test, type Page } from '@playwright/test';
import { loginWithTestAccount, openSavedSession, ownUserId, signIn } from './support/auth';
import { disconnectQuietly, fakeMedia, tearDownRoom } from './support/calls';
import { peerCredentials } from './support/env';
import { matrixRequest } from './support/matrix';
import { acceptDirectInvite, createDirectMessage, sendMessage } from './support/rooms';

test.use(fakeMedia());
test.skip(!process.env.E2E_PEER_USERNAME, 'needs a second account (E2E_PEER_USERNAME)');

// The caller rings the other side of a DM and stops ringing: the call stays up for the caller,
// and the other side's incoming call prompt goes away.
test('stopping the ring of a DM call closes the incoming call prompt and keeps the call', async ({
  page,
  browser,
}) => {
  let caller: Page | undefined;
  let roomId: string | undefined;
  try {
    await loginWithTestAccount(page);
    caller = await signIn(browser, peerCredentials());
    roomId = await createDirectMessage(page, await ownUserId(caller));
    await acceptDirectInvite(caller, roomId);
    // the callee has the DM open and is not in a call, so an incoming call prompts them
    await sendMessage(page, `ring ${Date.now()}`);

    await caller.getByRole('button', { name: 'Call', exact: true }).click();
    await caller.getByRole('button', { name: 'Voice', exact: true }).click();
    await expect(caller.getByText('Voice Connected', { exact: true })).toBeVisible();
    await expect(page.getByText('Incoming Call', { exact: true })).toBeVisible();

    await caller.getByRole('button', { name: 'Stop ringing', exact: true }).click();

    // the prompt closes, and nothing is left to stop on the caller's side
    await expect(page.getByText('Incoming Call', { exact: true })).toHaveCount(0);
    await expect(caller.getByRole('button', { name: 'Stop ringing', exact: true })).toHaveCount(0);
    await expect(caller.getByText('Voice Connected', { exact: true })).toBeVisible();
  } finally {
    if (caller) await disconnectQuietly(caller);
    await tearDownRoom(roomId, page, caller ? [caller] : []);
  }
});

// A caller who hangs up before anyone answers takes the ring back: a client that loads while the
// notification's lifetime still runs does not ring for a call that is over.
test('hanging up a ringing DM call leaves nothing to ring for a client that loads later', async ({
  page,
  browser,
}) => {
  let caller: Page | undefined;
  let later: Page | undefined;
  let roomId: string | undefined;
  try {
    await loginWithTestAccount(page);
    caller = await signIn(browser, peerCredentials());
    roomId = await createDirectMessage(page, await ownUserId(caller));
    await acceptDirectInvite(caller, roomId);
    await sendMessage(page, `ring ${Date.now()}`);

    await caller.getByRole('button', { name: 'Call', exact: true }).click();
    await caller.getByRole('button', { name: 'Voice', exact: true }).click();
    await expect(caller.getByText('Voice Connected', { exact: true })).toBeVisible();
    await expect(page.getByText('Incoming Call', { exact: true })).toBeVisible();

    await caller.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(page.getByText('Incoming Call', { exact: true })).toHaveCount(0);

    // the notification is in the sync that catches a client up
    later = await openSavedSession(browser);
    await expect(later.getByText('Incoming Call', { exact: true })).toHaveCount(0);
  } finally {
    await tearDownRoom(
      roomId,
      page,
      [caller, later].filter((p): p is Page => p !== undefined)
    );
  }
});

// A sync also replays the rings of rooms left since; the call is no business of someone who left.
test('a ring in a room the callee has left does not prompt a client that loads later', async ({
  page,
  browser,
}) => {
  let caller: Page | undefined;
  let later: Page | undefined;
  let roomId: string | undefined;
  try {
    await loginWithTestAccount(page);
    caller = await signIn(browser, peerCredentials());
    roomId = await createDirectMessage(page, await ownUserId(caller));
    await acceptDirectInvite(caller, roomId);
    await sendMessage(page, `ring ${Date.now()}`);

    await caller.getByRole('button', { name: 'Call', exact: true }).click();
    await caller.getByRole('button', { name: 'Voice', exact: true }).click();
    await expect(caller.getByText('Voice Connected', { exact: true })).toBeVisible();
    await expect(page.getByText('Incoming Call', { exact: true })).toBeVisible();

    // the caller stays in the call, ringing
    await matrixRequest(page, {
      method: 'POST',
      path: `/rooms/${encodeURIComponent(roomId)}/leave`,
      body: {},
    });
    later = await openSavedSession(browser);
    await expect(later.getByText('Incoming Call', { exact: true })).toHaveCount(0);
  } finally {
    if (caller) await disconnectQuietly(caller);
    await tearDownRoom(
      roomId,
      page,
      [caller, later].filter((p): p is Page => p !== undefined)
    );
  }
});

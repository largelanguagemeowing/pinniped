import { expect, test, type Locator, type Page, type Request } from '@playwright/test';
import { ownUserId, signIn } from './support/auth';
import { e2eCredentials, peerCredentials } from './support/env';
import { matrixRequest } from './support/matrix';
import { acceptDirectInvite, createDirectMessage, leaveRooms, openHome } from './support/rooms';

// Two people share a direct message, each signed in on a device of their own; the tests run in
// order on these two sessions. Synapse allows one presence update every 10 s by default, and
// Pinniped waits out the limit, so a quick second change takes a while to show.
test.skip(!process.env.E2E_PEER_USERNAME, 'needs a second account (E2E_PEER_USERNAME)');
test.describe.configure({ mode: 'serial' });

// Synapse shows a person as their most present device, and a device counts as online until 30 s
// after its last sync (checked every 5 s), so the first change from online waits for the devices
// earlier tests signed in with.
const OTHER_DEVICES_GONE = 40_000;

// MSC4320 rich presence, and Pinniped's expiry for a publisher that stopped without clearing it.
const RICH_PRESENCE = 'com.ip-logger.msc4320.rpc';
const RICH_PRESENCE_EXPIRES_AT = 'club.stablecat.pinniped.expires_at';
const STATUS_MESSAGE = 'club.stablecat.pinniped.status_message';

/** Whose presence changes. Their clock is Playwright's, so tests can skip ahead in time. */
let user: Page;
/** Who watches it. */
let peer: Page;
let roomId: string;

type Choice = 'Online' | 'Away' | 'Invisible';
type Shown = 'Active' | 'Away' | 'Offline';

/** The DM's row in the Home list, which shows the other person. */
const dmRow = (page: Page): Locator =>
  page.locator(`a[href^=${JSON.stringify(`/home/${encodeURIComponent(roomId)}`)}]`);

/** The presence badge on the other person's avatar, by the state it names. */
const badge = (row: Locator, shown: Shown): Locator =>
  row.getByRole('img', { name: shown, exact: true });

async function openAccountMenu(page: Page): Promise<void> {
  const button = page
    .getByRole('button', { name: 'User Settings', exact: true })
    .locator('xpath=preceding::button[@aria-haspopup="menu"][1]');
  // The account bar ignores its button for 300 ms after the menu closes, so that the press that
  // closed it cannot reopen it; a click in that time is tried again.
  await expect(async () => {
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 });
  }).toPass();
}

async function choosePresence(page: Page, choice: Choice): Promise<void> {
  await openAccountMenu(page);
  await page.getByRole('button', { name: choice, exact: true }).click();
}

/** The presence this person's own account menu shows as chosen, from what their sync reports. */
async function expectChosen(page: Page, choice: Choice): Promise<void> {
  await openAccountMenu(page);
  await expect(page.getByRole('button', { name: choice, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.keyboard.press('Escape');
}

/**
 * Sets the status message in Settings → Account (an empty one clears it) and closes Settings;
 * the save goes on, and callers check it where the other person sees it.
 */
async function setStatus(page: Page, status: string): Promise<void> {
  await openAccountMenu(page);
  await page.getByText('Edit Profile', { exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Status message' });
  await input.fill(status);
  await page.locator('form', { has: input }).getByRole('button', { name: 'Save' }).click();
  await page.keyboard.press('Escape');
}

/**
 * Lets `page` sync again without anyone using it: a person who sends, reads or marks something
 * is active, which brings an away device back online. The other person sets a new status, and
 * once it shows on `page`, its sync has gone round again since the last change. Returns the status.
 */
async function syncAgain(page: Page, other: Page): Promise<string> {
  const status = `syncing ${Date.now()}`;
  await setStatus(other, status);
  await expect(dmRow(page).getByText(status)).toBeVisible();
  return status;
}

/** Clears the status message (server and remembered copy) left by a test that failed midway. */
async function clearStatus(page: Page): Promise<void> {
  const id = encodeURIComponent(await ownUserId(page));
  await matrixRequest(page, {
    method: 'PUT',
    path: `/user/${id}/account_data/${STATUS_MESSAGE}`,
    body: { status: '' },
  });
  await matrixRequest(page, {
    method: 'PUT',
    path: `/presence/${id}/status`,
    body: { presence: 'online', status_msg: '' },
  });
}

const richPresencePath = async (page: Page) =>
  `/profile/${encodeURIComponent(await ownUserId(page))}/${RICH_PRESENCE}`;

/** Writes what a publisher writes for `page`'s person; a desktop app does this, the web cannot. */
const publishRichPresence = async (page: Page, track: string, expiresAt?: number) =>
  matrixRequest(page, {
    method: 'PUT',
    path: await richPresencePath(page),
    body: {
      [RICH_PRESENCE]: {
        type: `${RICH_PRESENCE}.media`,
        artist: 'E2E Artist',
        track,
        ...(expiresAt === undefined ? {} : { [RICH_PRESENCE_EXPIRES_AT]: expiresAt }),
      },
    },
  });

const unpublishRichPresence = async (page: Page) =>
  matrixRequest(page, { method: 'DELETE', path: await richPresencePath(page) });

// Synapse sends profile changes down sync only with include_profile_updates_in_sync, which is off
// by default; without it Pinniped looks at a profile again every 3 minutes.
const lookAgain = () => user.clock.fastForward('03:00');

// A look that was already under way when the profile changed misses it; the next one sees it.
const lookUntilVisible = (locator: Locator) =>
  expect(async () => {
    await lookAgain();
    await expect(locator).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });

test.beforeAll(async ({ browser }) => {
  user = await signIn(browser, e2eCredentials, { fakeClock: true });
  peer = await signIn(browser, peerCredentials());
  roomId = await createDirectMessage(user, await ownUserId(peer));
  await acceptDirectInvite(peer, roomId);
  await openHome(user);
  await expect(badge(dmRow(peer), 'Active')).toBeVisible();
});

test.afterAll(async () => {
  for (const page of [user, peer].filter(Boolean)) {
    await clearStatus(page).catch(() => undefined);
  }
  if (peer) {
    await matrixRequest(peer, {
      method: 'DELETE',
      path: await richPresencePath(peer),
      allowNotFound: true,
    }).catch(() => undefined);
  }
  if (roomId) {
    await leaveRooms(peer, [roomId]).catch(() => undefined);
    await leaveRooms(user, [roomId]);
  }
  await user?.context().close();
  await peer?.context().close();
});

test('the presence someone chooses reaches the person they share a chat with, and stays', async () => {
  const seen = dmRow(peer);

  await choosePresence(user, 'Away');
  await expect(badge(seen, 'Away')).toBeVisible({ timeout: OTHER_DEVICES_GONE });
  // every sync of theirs since must keep it: a sync without a presence counts as online
  await syncAgain(user, peer);
  await expectChosen(user, 'Away');
  await expect(badge(seen, 'Away')).toBeVisible();

  await choosePresence(user, 'Invisible');
  await expect(badge(seen, 'Offline')).toBeVisible();
  const peerStatus = await syncAgain(user, peer);
  await expectChosen(user, 'Invisible');
  await expect(badge(seen, 'Offline')).toBeVisible();

  await choosePresence(user, 'Online');
  await expect(badge(seen, 'Active')).toBeVisible();

  // and the peer's status, which went the other way, clears for them too
  await setStatus(peer, '');
  await expect(dmRow(user).getByText(peerStatus)).toHaveCount(0);
});

test('a status message reaches the other person and outlasts Invisible', async () => {
  const seen = dmRow(peer);
  const status = `out for lunch ${Date.now()}`;

  await setStatus(user, status);
  await expect(seen.getByText(status)).toBeVisible();

  // servers drop the message with offline presence; Pinniped sends it again
  await choosePresence(user, 'Invisible');
  await expect(badge(seen, 'Offline')).toBeVisible();
  await choosePresence(user, 'Online');
  await expect(badge(seen, 'Active')).toBeVisible();
  await expect(seen.getByText(status)).toBeVisible();

  await setStatus(user, '');
  await expect(seen.getByText(status)).toHaveCount(0);
});

test('rich presence shows with the person until they stop it or it goes stale', async () => {
  const seen = dmRow(user);
  const track = `e2e track ${Date.now()}`;

  await publishRichPresence(peer, track);
  await lookUntilVisible(seen.getByText(track));
  // and on their profile in the conversation
  await seen.click();
  await expect(user.getByText('E2E Artist', { exact: true })).toBeVisible();
  await openHome(user);

  // the publisher stops and clears it
  await unpublishRichPresence(peer);
  await lookAgain();
  await expect(seen.getByText(track)).toHaveCount(0);

  // a publisher that died left it behind: it expires on its own
  const now = await user.evaluate(() => Date.now());
  await publishRichPresence(peer, track, now + 4 * 60_000);
  await lookUntilVisible(seen.getByText(track));
  await user.clock.fastForward('01:01');
  await expect(seen.getByText(track)).toHaveCount(0);
  await unpublishRichPresence(peer);
});

test('someone invisible looks offline: no activity, and not online when they open the app again', async () => {
  // the peer is invisible here, so that the one watching can make Pinniped look at profiles again
  const seen = dmRow(user);
  const track = `e2e invisible ${Date.now()}`;
  await publishRichPresence(peer, track);
  await lookAgain();
  await expect(seen.getByText(track)).toBeVisible();

  // Their profile still has it (the desktop app takes it down), and it shows no more.
  await choosePresence(peer, 'Invisible');
  await expect(badge(seen, 'Offline')).toBeVisible();
  await expect(seen.getByText(track)).toHaveCount(0);

  // Opening the app again keeps them invisible from its first sync on. Synapse takes presence from
  // at most one sync in 10 s, so what the badge shows right after is no proof: each sync has to
  // say offline, since one that says nothing counts as online.
  const syncs: URL[] = [];
  const recordSync = (request: Request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/client/v3/sync')) syncs.push(url);
  };
  peer.on('request', recordSync);
  await peer.reload();
  const userStatus = await syncAgain(peer, user);
  peer.off('request', recordSync);
  expect(syncs.length).toBeGreaterThan(0);
  expect(syncs.map((url) => url.searchParams.get('set_presence'))).toEqual(
    syncs.map(() => 'offline')
  );
  await expect(badge(seen, 'Offline')).toBeVisible();
  await expect(seen.getByText(track)).toHaveCount(0);

  await choosePresence(peer, 'Online');
  await expect(badge(seen, 'Active')).toBeVisible();
  await expect(seen.getByText(track)).toBeVisible();

  await unpublishRichPresence(peer);
  await setStatus(user, '');
  await expect(dmRow(peer).getByText(userStatus)).toHaveCount(0);
});

test('someone idle for five minutes shows as away until they are back', async () => {
  const seen = dmRow(peer);
  // any input starts the idle timer over, and ends idling the earlier tests' time jumps caused
  await user.mouse.move(10, 10);
  await expect(badge(seen, 'Active')).toBeVisible();

  // five minutes pass without any
  await user.clock.fastForward('05:01');
  await expect(badge(seen, 'Away')).toBeVisible();
  const peerStatus = await syncAgain(user, peer);
  await expect(badge(seen, 'Away')).toBeVisible();

  await user.mouse.move(200, 200);
  await expect(badge(seen, 'Active')).toBeVisible();
  await setStatus(peer, '');
  await expect(dmRow(user).getByText(peerStatus)).toHaveCount(0);
});

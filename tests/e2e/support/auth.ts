import { type Browser, expect, type Page } from '@playwright/test';
import { type Credentials, e2eCredentials } from './env';

/** Where the setup project saves the signed-in session (playwright.config.ts uses it too). */
export const savedSession = 'playwright/.auth/user.json';

type SignInOptions = {
  /** Playwright's clock, installed before the app loads: time runs as usual until a test moves it. */
  fakeClock?: boolean;
};

/** Signs in on a browser context of its own, so this person gets a device of their own. */
export async function signIn(
  browser: Browser,
  credentials: Credentials,
  { fakeClock = false }: SignInOptions = {}
): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  if (fakeClock) await context.clock.install();
  const page = await context.newPage();
  await loginWithTestAccount(page, credentials);
  return page;
}

/**
 * Opens the app with the session the setup saved, once it has caught up on everything that
 * happened since: the saved sync position is old, so the first sync replays it as it comes.
 */
export async function openSavedSession(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: savedSession });
  const page = await context.newPage();
  let syncs = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/client/v3/sync') && url.searchParams.has('since')) syncs += 1;
  });
  await page.goto('/home/');
  // the next sync is asked for once the catching-up one is processed
  await expect.poll(() => syncs).toBeGreaterThan(1);
  return page;
}

export async function ownUserId(page: Page): Promise<string> {
  const userId = await page.evaluate(() => localStorage.getItem('cinny_user_id'));
  if (!userId) throw new Error('Missing authenticated Matrix session');
  return userId;
}

export async function loginWithTestAccount(
  page: Page,
  credentials: Credentials = e2eCredentials
): Promise<void> {
  await page.goto(`/login/${encodeURIComponent(credentials.homeserver)}`);

  const username = page.locator('input[name="usernameInput"]');
  const password = page.locator('input[name="passwordInput"]');
  await expect(username).toBeVisible();
  await username.fill(credentials.username);
  await password.fill(credentials.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await page.waitForURL(/\/(home|rooms|%23space)/, { timeout: 60_000 });
  // Every login is a new device: an account with cross-signing asks to verify it, a fresh one
  // offers recovery setup. Skipping either is remembered in the saved storage state.
  await page
    .getByRole('button', { name: 'Continue without verifying', exact: true })
    .or(page.getByRole('button', { name: 'Continue without recovery', exact: true }))
    .click({ timeout: 60_000 });
  await page
    .getByRole('button', { name: /^(Continue unverified|Continue without recovery)$/ })
    .click();
  await expect(page.getByRole('button', { name: 'User Settings' })).toBeVisible({
    timeout: 60_000,
  });
}

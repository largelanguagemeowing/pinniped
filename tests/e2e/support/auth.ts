import { expect, type Page } from '@playwright/test';
import { type Credentials, e2eCredentials } from './env';

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

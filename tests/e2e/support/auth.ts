import { expect, type Page } from '@playwright/test';
import { e2eCredentials } from './env';

export async function loginWithTestAccount(page: Page): Promise<void> {
  await page.goto(`/login/${encodeURIComponent(e2eCredentials.homeserver)}`);

  const username = page.locator('input[name="usernameInput"]');
  const password = page.locator('input[name="passwordInput"]');
  await expect(username).toBeVisible();
  await username.fill(e2eCredentials.username);
  await password.fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await page.waitForURL(/\/(home|rooms|%23space)/, { timeout: 60_000 });
  // every login is a new device; skipping verification is remembered in the saved storage state
  await page.getByRole('button', { name: 'Continue without verifying' }).click({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Continue unverified' }).click();
  await expect(page.getByRole('button', { name: 'User Settings' })).toBeVisible({
    timeout: 60_000,
  });
}

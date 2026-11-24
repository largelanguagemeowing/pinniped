import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { test as setup } from '@playwright/test';
import { loginWithTestAccount, savedSession } from './support/auth';

const authFile = savedSession;

setup('authenticate with the E2E account', async ({ page }) => {
  await loginWithTestAccount(page);
  await mkdir(dirname(authFile), { recursive: true });
  // IndexedDB holds the device's encryption keys: without them every test would start the same
  // device with new keys, which the homeserver refuses, and to-device messages to it fail.
  await page.context().storageState({ path: authFile, indexedDB: true });
});

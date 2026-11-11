import { expect, Page, Route, test } from '@playwright/test';

// The whole registration flow against a mocked homeserver, so it runs without burning
// registration tokens or needing a real inbox. Mirrors Synapse's answers for
// stablecat.club: token + dummy, or token + email.
test.use({ storageState: { cookies: [], origins: [] } });

const SERVER = 'e2e-register.test';
const BASE = `https://matrix.${SERVER}`;
const GOOD_TOKEN = 'good-token';

type Mock = {
  emailRequests: string[];
  emailClicked: boolean;
  failEmailFor?: string;
  registered?: string;
};

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });

const FLOWS = [
  { stages: ['m.login.registration_token', 'm.login.dummy'] },
  { stages: ['m.login.registration_token', 'm.login.email.identity'] },
];

async function mockHomeserver(page: Page, mock: Mock) {
  const completed = new Set<string>();
  await page.route(`https://${SERVER}/.well-known/matrix/client`, (r) =>
    json(r, 200, { 'm.homeserver': { base_url: BASE } })
  );
  await page.route(`${BASE}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
          'access-control-allow-headers': 'Content-Type, Authorization',
        },
      });
    }
    const url = new URL(req.url());
    const p = url.pathname;
    if (p === '/_matrix/client/versions') return json(route, 200, { versions: ['v1.11'] });
    if (p.endsWith('/login')) return json(route, 200, { flows: [{ type: 'm.login.password' }] });
    if (p.endsWith('/register/available')) {
      return url.searchParams.get('username') === 'taken'
        ? json(route, 400, { errcode: 'M_USER_IN_USE', error: 'User ID already taken.' })
        : json(route, 200, { available: true });
    }
    if (p.endsWith('/m.login.registration_token/validity')) {
      return json(route, 200, { valid: url.searchParams.get('token') === GOOD_TOKEN });
    }
    if (p.endsWith('/register/email/requestToken')) {
      const { email } = req.postDataJSON() as { email: string };
      mock.emailRequests.push(email);
      if (email === mock.failEmailFor) {
        return json(route, 500, {
          errcode: 'M_UNKNOWN',
          error: 'An error was encountered when sending the email',
        });
      }
      return json(route, 200, { sid: 'sid-1' });
    }
    if (p.endsWith('/register') && req.method() === 'POST') {
      const body = req.postDataJSON() as {
        username?: string;
        auth?: { type?: string; token?: string };
      };
      const auth = body.auth ?? {};
      const challenge = (extra: object = {}) =>
        json(route, 401, {
          session: 'sess',
          flows: FLOWS,
          params: {},
          completed: [...completed],
          ...extra,
        });
      if (auth.type === 'm.login.registration_token') {
        if (auth.token !== GOOD_TOKEN) {
          return challenge({ errcode: 'M_UNAUTHORIZED', error: 'Invalid registration token' });
        }
        completed.add(auth.type);
        return challenge();
      }
      if (auth.type === 'm.login.email.identity') {
        if (!mock.emailClicked) return challenge({ errcode: 'M_UNAUTHORIZED', error: '' });
        completed.add(auth.type);
      }
      if (auth.type === 'm.login.dummy') completed.add(auth.type);
      const done = FLOWS.some((f) => f.stages.every((s) => completed.has(s)));
      if (!done) return challenge();
      mock.registered = body.username;
      // No access token: Pinniped then sends the person to the login page with the
      // username filled in, which keeps the test away from a real sync.
      return json(route, 200, { user_id: `@${body.username}:${SERVER}` });
    }
    return json(route, 404, { errcode: 'M_UNRECOGNIZED' });
  });
}

async function fillForm(page: Page, opts: { username: string; token: string; email?: string }) {
  await page.goto(`/register/${SERVER}/`);
  await page.locator('input[name="usernameInput"]').fill(opts.username);
  await page.locator('input[name="passwordInput"]').fill('correct-horse-battery-1');
  await page.locator('input[name="confirmPasswordInput"]').fill('correct-horse-battery-1');
  await page.locator('input[name="tokenInput"]').fill(opts.token);
  if (opts.email) await page.locator('input[name="emailInput"]').fill(opts.email);
}

test.describe('Registration', () => {
  test('checks username and token while typing', async ({ page }) => {
    const mock: Mock = { emailRequests: [], emailClicked: false };
    await mockHomeserver(page, mock);
    await fillForm(page, { username: 'taken', token: 'nope' });

    await expect(page.getByText('This username is already taken.')).toBeVisible();
    await expect(page.getByText(/token is wrong, expired or used up/)).toBeVisible();

    await page.locator('input[name="usernameInput"]').fill('newuser');
    await page.locator('input[name="tokenInput"]').fill(GOOD_TOKEN);
    await expect(page.getByText('This username is available.')).toBeVisible();
    await expect(page.getByText('Token is valid.')).toBeVisible();
  });

  test('registers with a token and no email', async ({ page }) => {
    const mock: Mock = { emailRequests: [], emailClicked: false };
    await mockHomeserver(page, mock);
    await fillForm(page, { username: 'newuser', token: GOOD_TOKEN });
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/login\//);
    expect(mock.registered).toBe('newuser');
    expect(mock.emailRequests).toEqual([]);
  });

  test('email: typo hint, friendly send error, retry, continues on its own once verified', async ({
    page,
  }) => {
    const mock: Mock = {
      emailRequests: [],
      emailClicked: false,
      failEmailFor: 'user@gmial.com',
    };
    await mockHomeserver(page, mock);
    await fillForm(page, { username: 'newuser', token: GOOD_TOKEN, email: 'user@gmial.com' });

    await page.locator('input[name="passwordInput"]').focus();
    await expect(page.getByText('Did you mean')).toBeVisible();
    await expect(page.getByRole('button', { name: 'user@gmail.com' })).toBeVisible();

    // Submit the typo anyway: the relay rejects it and Synapse answers a bare 500.
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Could not send the email')).toBeVisible();
    await expect(page.getByText(/typo in the address/)).toBeVisible();
    await expect(page.getByText('M_UNKNOWN')).toHaveCount(0);

    const retry = page.locator('input[name="retryEmailInput"]');
    await expect(retry).toHaveValue('user@gmial.com');
    const dialog = page.locator('#portalContainer');
    await dialog.getByRole('button', { name: 'user@gmail.com' }).click();
    await expect(retry).toHaveValue('user@gmail.com');
    await page.getByRole('button', { name: 'Send verification email' }).click();

    await expect(page.getByText('Check your inbox')).toBeVisible();
    await expect(page.getByText('Waiting for you to click the link…')).toBeVisible();

    // Polling must not show a "not verified" error while we wait.
    await page.waitForTimeout(5000);
    await expect(page.getByText(/has not been opened yet/)).toHaveCount(0);

    mock.emailClicked = true;
    await expect(page).toHaveURL(/\/login\//, { timeout: 15_000 });
    expect(mock.registered).toBe('newuser');
    expect(mock.emailRequests).toEqual(['user@gmial.com', 'user@gmail.com']);
  });

  test('cancelling the email step keeps the form instead of reloading', async ({ page }) => {
    const mock: Mock = { emailRequests: [], emailClicked: false };
    await mockHomeserver(page, mock);
    await fillForm(page, { username: 'newuser', token: GOOD_TOKEN, email: 'user@gmail.com' });
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Check your inbox')).toBeVisible();

    await page.getByRole('button', { name: 'Change email' }).click();
    await expect(page.getByText('Check your inbox')).toHaveCount(0);
    await expect(page.locator('input[name="usernameInput"]')).toHaveValue('newuser');
    await expect(page.locator('input[name="tokenInput"]')).toHaveValue(GOOD_TOKEN);
  });
});

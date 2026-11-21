import { expect, test, type Page } from '@playwright/test';

// Fork dark themes on the Appearance settings page.
// Settings live in the `settings` localStorage key; every test restores the
// previous value afterwards.

type StoredSettings = Record<string, unknown>;

const storedSettings = (page: Page): Promise<StoredSettings> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('settings') ?? '{}') as StoredSettings);

const writeSettings = async (page: Page, settings: StoredSettings): Promise<void> => {
  await page.evaluate((value) => localStorage.setItem('settings', JSON.stringify(value)), settings);
};

const openAppearance = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'User Settings' }).click();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(page.getByText('System Theme', { exact: true })).toBeVisible();
};

/** The single control button of the setting tile with the given title. */
const tileButton = (page: Page, title: string) =>
  page.getByText(title, { exact: true }).locator('xpath=../..').getByRole('button').first();

test.describe('Appearance themes', () => {
  let previous: StoredSettings;

  test.beforeEach(async ({ page }) => {
    await page.goto('/home/');
    previous = await storedSettings(page);
    await openAppearance(page);
  });

  test.afterEach(async ({ page }) => {
    await writeSettings(page, previous);
    await page.reload();
  });

  test('manual theme choice persists across reload', async ({ page }) => {
    await writeSettings(page, { ...previous, useSystemTheme: false });
    await page.reload();
    await openAppearance(page);

    await tileButton(page, 'Theme').click();
    await page.getByRole('button', { name: 'Nord', exact: true }).click();

    await expect.poll(() => storedSettings(page).then((settings) => settings.themeId)).toBe('nord');

    await page.reload();
    await openAppearance(page);
    expect(await storedSettings(page).then((settings) => settings.themeId)).toBe('nord');
    await expect(page.locator('body')).toHaveClass(/\bnord\b/);
  });

  test('light menu excludes the fork dark themes', async ({ page }) => {
    await writeSettings(page, { ...previous, useSystemTheme: true });
    await page.reload();
    await openAppearance(page);

    await tileButton(page, 'Light Theme:').click();
    await expect(page.getByRole('button', { name: 'Silver', exact: true })).toBeVisible();
    await Promise.all(
      ['Nord', 'Dracula', 'Ayu Dark', 'Gruvbox Dark Hard'].map((fork) =>
        expect(page.getByRole('button', { name: fork, exact: true })).toHaveCount(0)
      )
    );
    await page.keyboard.press('Escape');
  });

  test('dark preference and manual selection are stored independently', async ({ page }) => {
    await writeSettings(page, { ...previous, useSystemTheme: true });
    await page.reload();
    await openAppearance(page);

    await tileButton(page, 'Dark Theme:').click();
    await page.getByRole('button', { name: 'Tokyo Night Storm', exact: true }).click();
    await expect
      .poll(() => storedSettings(page).then((settings) => settings.darkThemeId))
      .toBe('tokyo-night-storm');
    expect(await storedSettings(page).then((settings) => settings.themeId)).toBe(previous.themeId);

    await writeSettings(page, { ...(await storedSettings(page)), useSystemTheme: false });
    await page.reload();
    await openAppearance(page);
    await tileButton(page, 'Theme').click();
    await page.getByRole('button', { name: 'Rosé Pine Moon', exact: true }).click();
    await expect
      .poll(() => storedSettings(page).then((settings) => settings.themeId))
      .toBe('rose-pine-moon');
    expect(await storedSettings(page).then((settings) => settings.darkThemeId)).toBe(
      'tokyo-night-storm'
    );
  });

  test('OS color-scheme switch applies the matching saved preference', async ({ page }) => {
    await writeSettings(page, {
      ...previous,
      useSystemTheme: true,
      lightThemeId: 'silver-theme',
      darkThemeId: 'dracula',
    });
    await page.reload();
    await openAppearance(page);

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('body')).toHaveClass(/\bdracula\b/, { timeout: 10_000 });

    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('body')).toHaveClass(/\bsilver-theme\b/, { timeout: 10_000 });

    // both saved preferences survive the switches
    const after = await storedSettings(page);
    expect(after.darkThemeId).toBe('dracula');
    expect(after.lightThemeId).toBe('silver-theme');
  });

  test('long theme menu scrolls to the last item and applies it', async ({ page }) => {
    await writeSettings(page, { ...previous, useSystemTheme: false });
    await page.reload();
    await openAppearance(page);

    await tileButton(page, 'Theme').click();
    const last = page.getByRole('button', { name: 'Tokyo Night Storm', exact: true });
    await last.scrollIntoViewIfNeeded();
    await last.click();
    await expect
      .poll(() => storedSettings(page).then((settings) => settings.themeId))
      .toBe('tokyo-night-storm');
    await expect(page.locator('body')).toHaveClass(/\btokyo-night-storm\b/);
  });

  test('fork themes apply the dark link variable', async ({ page }) => {
    await writeSettings(page, { ...previous, useSystemTheme: false, themeId: 'catppuccin-mocha' });
    await page.reload();

    await expect(page.locator('body')).toHaveClass(/\bcatppuccin-mocha\b/);
    // HSL lightness of the resolved link color; the build may rewrite its notation
    const linkLightness = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--tc-link)';
      document.body.append(probe);
      const [r, g, b] = (getComputedStyle(probe).color.match(/[\d.]+/g) ?? []).map(Number);
      probe.remove();
      return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
    });
    // the shared dark link value (80% lightness), not the light default (45%)
    expect(linkLightness).toBeCloseTo(0.8, 2);
  });
});

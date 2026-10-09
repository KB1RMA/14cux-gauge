// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Page } from '@playwright/test';
import {
  expect,
  expectNoAxeViolations,
  reading,
  test,
} from './support/fixtures';

/** The colour the page is painted, as the user sees it. */
function pageBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

/** Opens the Preferences menu, as the user does from the app bar. */
async function openPreferences(page: Page) {
  await page.getByRole('button', { name: 'Preferences' }).click();

  return page.getByRole('menu');
}

test.describe('Preferences', () => {
  test('changes units, theme and paint, and remembers them after a reload', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await expect(reading(page, 'Coolant')).toHaveText(/°F$/);

    const lightBackground = await pageBackground(page);
    const menu = await openPreferences(page);

    await expectNoAxeViolations(page, { within: '[role="menu"]' });
    await menu.getByRole('menuitemradio', { name: /Celsius/ }).click();
    await menu
      .getByRole('menuitemradio', { name: /Kilometres per hour/ })
      .click();
    await menu.getByRole('menuitemradio', { name: 'Dark' }).click();
    await expect(
      menu.getByRole('menuitemradio', { name: 'Dark' }),
    ).toBeChecked();

    // The page goes dark, even though the system asks for light.
    await expect.poll(() => pageBackground(page)).not.toBe(lightBackground);

    const darkBackground = await pageBackground(page);

    await menu.getByRole('menuitemradio', { name: 'Arles Blue' }).click();
    await expect(
      menu.getByRole('menuitemradio', { name: 'Arles Blue' }),
    ).toBeChecked();

    // Each paint has its own background, so the page is repainted again.
    await expect.poll(() => pageBackground(page)).not.toBe(darkBackground);

    const chosenBackground = await pageBackground(page);

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    await expect(reading(page, 'Coolant')).toHaveText(/°C$/);
    await expect(reading(page, 'Road speed')).toHaveText(/km\/h$/);

    await page.reload();

    // Painted as chosen before connecting.
    await expect.poll(() => pageBackground(page)).toBe(chosenBackground);
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await expect(reading(page, 'Coolant')).toHaveText(/°C$/);
    await expect(reading(page, 'Road speed')).toHaveText(/km\/h$/);

    const reopened = await openPreferences(page);

    await expect(
      reopened.getByRole('menuitemradio', { name: 'Dark' }),
    ).toBeChecked();
    await expect(
      reopened.getByRole('menuitemradio', { name: 'Arles Blue' }),
    ).toBeChecked();
  });

  // Every paint in both modes, so axe measures each palette's real contrast.
  for (const palette of [
    'Coniston Green',
    'Arles Blue',
    'Alpine White and Beluga Black',
    'British Racing Green',
  ] as const) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`meets WCAG 2.2 AA, colour contrast included, in ${palette} ${colorScheme}`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto('./');

        const menu = await openPreferences(page);

        await menu.getByRole('menuitemradio', { name: palette }).click();
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await expectNoAxeViolations(page);

        await page.getByRole('button', { name: 'Demo mode' }).click();
        await page.getByRole('button', { name: 'Read fault codes' }).click();
        await expect(reading(page, 'MIL')).toHaveText('On');
        await expect(
          page.getByRole('list', { name: 'Stored fault codes' }),
        ).toBeVisible();
        await expectNoAxeViolations(page);

        // The fuel map tints its cells, so measure them in every palette.
        await page.getByRole('tab', { name: 'Fuel map' }).click();
        await expect(
          page.getByRole('cell', { name: /in use now/ }),
        ).toBeVisible();
        await expectNoAxeViolations(page);

        await openPreferences(page);
        await expectNoAxeViolations(page, { within: '[role="menu"]' });
      });
    }
  }
});

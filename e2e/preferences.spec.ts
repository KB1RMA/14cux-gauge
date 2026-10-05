// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  expect,
  expectNoAxeViolations,
  reading,
  test,
} from './support/fixtures';

test.describe('Preferences', () => {
  test('changes units and theme, and remembers them after a reload', async ({
    page,
  }) => {
    // The theme is an attribute on the root element, which has no role.
    // eslint-disable-next-line playwright/no-raw-locators -- see above
    const root = page.locator('html');

    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await expect(reading(page, 'Coolant')).toHaveText(/°F$/);

    await page.getByRole('button', { name: 'Preferences' }).click();

    const menu = page.getByRole('menu');

    await expectNoAxeViolations(page, { within: '[role="menu"]' });
    await menu.getByRole('menuitemradio', { name: /Celsius/ }).click();
    await menu
      .getByRole('menuitemradio', { name: /Kilometres per hour/ })
      .click();
    await menu.getByRole('menuitemradio', { name: 'Dark' }).click();
    await expect(
      menu.getByRole('menuitemradio', { name: 'Dark' }),
    ).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    await expect(reading(page, 'Coolant')).toHaveText(/°C$/);
    await expect(reading(page, 'Road speed')).toHaveText(/km\/h$/);
    await expect(root).toHaveAttribute('data-theme', 'dark');

    await page.reload();

    await expect(root).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await expect(reading(page, 'Coolant')).toHaveText(/°C$/);
    await expect(reading(page, 'Road speed')).toHaveText(/km\/h$/);
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`meets WCAG 2.2 AA, colour contrast included, in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('./');
      await expectNoAxeViolations(page);

      await page.getByRole('button', { name: 'Demo mode' }).click();
      await page.getByRole('button', { name: 'Read fault codes' }).click();
      await expect(reading(page, 'MIL')).toHaveText('On');
      await expect(
        page.getByRole('list', { name: 'Stored fault codes' }),
      ).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }
});

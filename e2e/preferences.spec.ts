// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  expect,
  expectNoAxeViolations,
  reading,
  test,
} from './support/fixtures';

test.describe('Preferences', () => {
  test('changes units, theme and paint, and remembers them after a reload', async ({
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
    await menu.getByRole('menuitemradio', { name: 'Arles Blue' }).click();
    await expect(
      menu.getByRole('menuitemradio', { name: 'Arles Blue' }),
    ).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    await expect(reading(page, 'Coolant')).toHaveText(/°C$/);
    await expect(reading(page, 'Road speed')).toHaveText(/km\/h$/);
    await expect(root).toHaveAttribute('data-theme', 'dark');
    await expect(root).toHaveAttribute('data-palette', 'arles');

    await page.reload();

    await expect(root).toHaveAttribute('data-theme', 'dark');
    await expect(root).toHaveAttribute('data-palette', 'arles');
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await expect(reading(page, 'Coolant')).toHaveText(/°C$/);
    await expect(reading(page, 'Road speed')).toHaveText(/km\/h$/);
  });

  // Every paint in both modes, so axe measures each palette's real contrast.
  for (const palette of [
    'coniston',
    'arles',
    'alpine-beluga',
    'racing-green',
  ] as const) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`meets WCAG 2.2 AA, colour contrast included, in ${palette} ${colorScheme}`, async ({
        page,
      }) => {
        await page.addInitScript((stored) => {
          localStorage.setItem('cuxGauge.preferences', stored);
        }, JSON.stringify({ palette }));
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

        await page.getByRole('button', { name: 'Preferences' }).click();
        await expectNoAxeViolations(page, { within: '[role="menu"]' });
      });
    }
  }
});

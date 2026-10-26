// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Page } from '@playwright/test';
import {
  expect,
  expectNoAxeViolations,
  openPreferences,
  reading,
  test,
} from './support/fixtures';

/** The colour the page is painted, as the user sees it. */
function pageBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
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
    const dialog = await openPreferences(page);

    await expectNoAxeViolations(page, { within: '[role="dialog"]' });
    await dialog.getByRole('radio', { name: 'Celsius (°C)' }).click();
    await dialog
      .getByRole('radio', { name: 'Kilometres per hour (km/h)' })
      .click();

    // Each section is part of the address, so Back from here closes
    // Preferences rather than stepping through sections.
    await dialog.getByRole('tab', { name: 'Appearance' }).click();
    await expect(page).toHaveURL(/#\/live\?preferences=appearance$/);
    await dialog.getByRole('radio', { name: 'Dark' }).click();
    await expect(dialog.getByRole('radio', { name: 'Dark' })).toBeChecked();

    // The page goes dark, even though the system asks for light.
    await expect.poll(() => pageBackground(page)).not.toBe(lightBackground);

    const darkBackground = await pageBackground(page);

    await dialog.getByRole('radio', { name: 'Arles Blue' }).click();
    await expect(
      dialog.getByRole('radio', { name: 'Arles Blue' }),
    ).toBeChecked();

    // Each paint has its own background, so the page is repainted again.
    await expect.poll(() => pageBackground(page)).not.toBe(darkBackground);

    const chosenBackground = await pageBackground(page);

    await page.goBack();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/#\/live$/);
    await expect(
      page.getByRole('button', { name: 'Preferences' }),
    ).toBeFocused();

    await expect(reading(page, 'Coolant')).toHaveText(/°C$/);
    await expect(reading(page, 'Road speed')).toHaveText(/km\/h$/);

    await page.reload();

    // Painted as chosen before connecting.
    await expect.poll(() => pageBackground(page)).toBe(chosenBackground);
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await expect(reading(page, 'Coolant')).toHaveText(/°C$/);
    await expect(reading(page, 'Road speed')).toHaveText(/km\/h$/);

    const reopened = await openPreferences(page, 'Appearance');

    await expect(reopened.getByRole('radio', { name: 'Dark' })).toBeChecked();
    await expect(
      reopened.getByRole('radio', { name: 'Arles Blue' }),
    ).toBeChecked();
  });

  test('opens from a link at the section it names, over the view behind', async ({
    page,
  }) => {
    await page.goto('./#/sessions?preferences=limits');

    const dialog = page.getByRole('dialog', { name: 'Preferences' });

    await expect(
      dialog.getByRole('tab', { name: 'Limits', selected: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('group', { name: 'Coolant (°F)' }),
    ).toBeVisible();
    await expectNoAxeViolations(page, { within: '[role="dialog"]' });

    await dialog.getByRole('button', { name: 'Close preferences' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/#\/sessions$/);
    await expect(
      page.getByRole('button', { name: 'Preferences' }),
    ).toBeFocused();
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

        const dialog = await openPreferences(page, 'Appearance');

        await dialog.getByRole('radio', { name: palette }).click();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
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

        for (const section of ['General', 'Appearance', 'Limits'] as const) {
          await openPreferences(page, section);
          await expectNoAxeViolations(page, { within: '[role="dialog"]' });
          await page.keyboard.press('Escape');
        }
      });
    }
  }
});

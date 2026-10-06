// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { expect, expectNoAxeViolations, test } from './support/fixtures';

test.describe('Live graphs', () => {
  test('draws a graph per metric, and remembers the chosen view, window and graphs', async ({
    page,
  }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();

    const tabs = page.getByRole('tablist', { name: 'Dashboard views' });

    await tabs.getByRole('tab', { name: 'Graphs' }).click();
    await expect(
      page.getByRole('heading', { name: 'Live graphs' }),
    ).toBeVisible();
    await expect(page.getByRole('figure')).toHaveCount(20);

    const rpm = page.getByRole('figure', { name: 'Engine speed (rpm)' });

    // The chart library loads on demand and draws into a canvas.
    // eslint-disable-next-line playwright/no-raw-locators -- a canvas has no role; it is hidden from assistive tech
    await expect(rpm.locator('canvas')).toBeVisible();
    await expect(rpm.getByRole('definition').first()).toHaveText(/^\d+ rpm$/);
    await expectNoAxeViolations(page);

    await page.getByRole('radio', { name: '5 minutes' }).click();
    await expect(page.getByRole('radio', { name: '5 minutes' })).toBeChecked();

    await page.getByRole('button', { name: /Choose readings/ }).click();

    const picker = page.getByRole('dialog', { name: 'Readings to take' });

    await expectNoAxeViolations(page);
    await picker.getByRole('checkbox', { name: 'Fuel temp' }).click();
    await expect(
      picker.getByRole('checkbox', { name: 'Fuel temp' }),
    ).not.toBeChecked();
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    await expect(page.getByRole('figure')).toHaveCount(19);

    await page.reload();
    await page.getByRole('button', { name: 'Demo mode' }).click();

    await expect(
      page.getByRole('heading', { name: 'Live graphs' }),
    ).toBeFocused();
    await expect(page.getByRole('radio', { name: '5 minutes' })).toBeChecked();
    await expect(page.getByRole('figure')).toHaveCount(19);
    await expect(
      page.getByRole('figure', { name: 'Fuel temp (°F)' }),
    ).toHaveCount(0);
  });

  test('switches views with the keyboard', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();

    const overview = page.getByRole('tab', { name: 'Overview' });

    await overview.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Graphs' })).toBeFocused();
    await expect(
      page.getByRole('heading', { name: 'Live graphs' }),
    ).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(overview).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('heading', { name: 'Live data' }),
    ).toBeVisible();
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`meets WCAG 2.2 AA, colour contrast included, in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('./');
      await page.getByRole('button', { name: 'Demo mode' }).click();
      await page.getByRole('tab', { name: 'Graphs' }).click();
      await expect(
        page
          .getByRole('figure', { name: 'Engine speed (rpm)' })
          .getByRole('definition')
          .first(),
      ).toHaveText(/rpm$/);
      await expectNoAxeViolations(page);
    });
  }
});

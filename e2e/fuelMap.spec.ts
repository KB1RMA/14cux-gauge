// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  expect,
  expectNoAxeViolations,
  reading,
  tabKey,
  tabTo,
  test,
} from './support/fixtures';

test.describe('Fuel map', () => {
  test('shows the map in use and follows the cell the ECU is using', async ({
    page,
  }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await expect(reading(page, 'Rev limit')).toHaveText('5000 rpm');
    await expect(reading(page, 'Target idle')).toHaveText(/^\d+ rpm$/);
    await expect(reading(page, 'Injector pulse')).toHaveText(/^\d+\.\d\d ms$/);
    await expect(reading(page, 'Injector duty')).toHaveText(/^\d+\.\d %$/);
    await expect(reading(page, 'Idle control')).toHaveText('Active');

    await page.getByRole('tab', { name: 'Fuel map' }).click();
    await expect(page.getByRole('heading', { name: 'Fuel map' })).toBeVisible();

    const table = page.getByRole('table', { name: /^Fuel map \d+$/ });

    await expect(reading(page, 'Map in use')).toHaveText('5');
    await expect(reading(page, 'Row scaler')).toHaveText('0xB0');
    await expect(table.getByRole('columnheader')).toHaveCount(17);
    await expect(table.getByRole('row')).toHaveCount(9);

    // Cold idle in the demo sits in the top row.
    const inUse = table.getByRole('cell', { name: /in use now/ });

    await expect(inUse).toHaveCount(1);
    await expect(
      page.getByText(/^In use now: row 1, \d+ rpm column \(outlined\)\.$/),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('scrolls inside a focusable region on a narrow screen', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await page.getByRole('tab', { name: 'Fuel map' }).click();

    const region = page.getByRole('region', { name: /^Fuel map 5 values/ });

    await expect(region).toBeVisible();

    // The table scrolls inside its region; the page itself does not.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    expect(
      await region.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBe(true);

    // The region is in the tab order after the tab list, so the browser's
    // arrow-key scrolling reaches it.
    await page.getByRole('tab', { name: 'Fuel map' }).focus();
    await tabTo(page, region, tabKey(browserName));
    await expect(region).toBeFocused();
  });
});

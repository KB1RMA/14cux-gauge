// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { expect, expectNoAxeViolations, test } from './support/fixtures';

test.describe('Addresses', () => {
  test('every live view has an address that survives a reload', async ({
    page,
  }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await page.getByRole('tab', { name: 'Graphs' }).click();
    await expect(page).toHaveURL(/#\/live\/graphs$/);

    await page.reload();

    // Reloading drops the connection, but the address is kept.
    await expect(page).toHaveURL(/#\/live\/graphs$/);
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await expect(
      page.getByRole('tab', { name: 'Graphs', selected: true }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('Back and Forward move between views', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await page.getByRole('tab', { name: 'Fuel map' }).click();
    await page.getByRole('link', { name: 'Sessions' }).click();
    await expect(
      page.getByRole('heading', { name: 'Recorded sessions' }),
    ).toBeVisible();

    await page.goBack();
    await expect(
      page.getByRole('tab', { name: 'Fuel map', selected: true }),
    ).toBeVisible();

    await page.goBack();
    await expect(
      page.getByRole('tab', { name: 'Overview', selected: true }),
    ).toBeVisible();

    await page.goForward();
    await expect(
      page.getByRole('tab', { name: 'Fuel map', selected: true }),
    ).toBeVisible();
  });

  test('a session address opens that session, or says it is gone', async ({
    page,
  }) => {
    await page.goto('./#/sessions/not-a-session/graphs');

    await expect(
      page.getByText('This session has been deleted.'),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

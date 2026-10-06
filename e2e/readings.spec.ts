// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Locator, Page } from '@playwright/test';
import {
  expect,
  expectNoAxeViolations,
  reading,
  test,
} from './support/fixtures';

/** The sample rate the connection bar shows, once it has settled. */
async function settledRate(connection: Locator): Promise<number> {
  let rate = 0;

  // The rate is averaged over the last ten passes; let it settle.
  await expect
    .poll(
      async () => {
        const text = (await connection.textContent()) ?? '';
        const next = Number(/([\d.]+) samples\/s/.exec(text)?.[1] ?? 0);
        const settled = next > 0 && Math.abs(next - rate) / next < 0.15;

        rate = next;

        return settled;
      },
      { intervals: [500], timeout: 10_000 },
    )
    .toBe(true);

  return rate;
}

/** The names of the live readings shown on the overview. */
function liveTerms(page: Page): Locator {
  return page.getByRole('region', { name: 'Live data' }).getByRole('term');
}

test.describe('Choosing readings', () => {
  test('reading fewer values polls faster, and the choice is remembered', async ({
    page,
  }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();

    const connection = page.getByRole('region', { name: 'Connection' });
    const allRate = await settledRate(connection);

    await page.getByRole('button', { name: /Choose readings/ }).click();

    const picker = page.getByRole('dialog', { name: 'Readings to take' });

    await expectNoAxeViolations(page);
    await picker.getByRole('button', { name: 'Only Engine speed' }).click();
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();

    await expect(liveTerms(page)).toHaveText(['Engine speed', 'MIL']);
    await expect(connection).toContainText('2 of 20 readings');

    const oneRate = await settledRate(connection);

    // The demo's simulated link makes fewer reads much faster.
    expect(oneRate).toBeGreaterThan(allRate * 2);
    await expectNoAxeViolations(page);

    await page.reload();
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await expect(reading(page, 'Engine speed')).toHaveText(/^\d+ rpm$/);
    await expect(liveTerms(page)).toHaveText(['Engine speed', 'MIL']);

    await page.getByRole('button', { name: /Choose readings/ }).click();
    await page
      .getByRole('dialog', { name: 'Readings to take' })
      .getByRole('button', { name: 'All' })
      .click();
    await page.keyboard.press('Escape');
    await expect(liveTerms(page)).toHaveCount(20);
    await expect(connection).not.toContainText('readings');
  });

  test('the fuel map follows the engine even when its position is not chosen', async ({
    page,
  }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await page.getByRole('button', { name: /Choose readings/ }).click();
    await page.getByRole('button', { name: 'Only Coolant' }).click();
    await page.keyboard.press('Escape');

    await page.getByRole('tab', { name: 'Fuel map' }).click();
    await expect(page.getByRole('cell', { name: /in use now/ })).toHaveCount(1);
  });
});

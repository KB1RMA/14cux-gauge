// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  USAGE_COUNTER_HOSTS,
  expect,
  openPreferences,
  test,
} from './support/fixtures';

test.describe('Usage counts', () => {
  test('are neither sent nor offered outside the published site', async ({
    page,
  }) => {
    const requests: string[] = [];

    page.on('request', (request) => {
      if (USAGE_COUNTER_HOSTS.test(request.url())) {
        requests.push(request.url());
      }
    });

    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await expect(
      page.getByRole('heading', { name: 'Live data' }),
    ).toBeVisible();

    const preferences = await openPreferences(page);

    await expect(
      preferences.getByRole('radiogroup', { name: 'Usage counts' }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');

    await expect(page.getByRole('contentinfo')).not.toContainText(
      'GoatCounter',
    );
    expect(requests).toEqual([]);
  });
});

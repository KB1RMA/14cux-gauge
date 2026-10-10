// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  test as base,
  expect,
  expectNoAxeViolations,
} from './support/fixtures';

// These tests make the app fail to start on purpose, and the browser logs
// that as an error; any other error still shows in what the page says.
const test = base.extend({
  pageErrors: async ({}, use) => {
    await use(undefined);
  },
});

// A page that stays blank tells the user nothing. When the app cannot start,
// as when its code did not download or an offline copy is broken, the page
// must say so and offer a way back.
test.describe('When the app cannot start', () => {
  test('says so, and starts once the code downloads', async ({ page }) => {
    // The app's own code fails to arrive once, as on a dropped connection or
    // a site deployed while the page was loading.
    await page.route(
      /\/assets\/index-[^/]+\.js$/,
      (route) => route.abort('failed'),
      { times: 1 },
    );
    await page.goto('./');

    const error = page.getByRole('main', {
      name: '14CUX Gauge could not start',
    });

    await expect(error).toBeVisible();
    await expect(error).toContainText(
      'Part of the app could not be downloaded.',
    );
    await expect(
      error.getByRole('heading', { name: '14CUX Gauge could not start' }),
    ).toBeFocused();
    await expect(
      error.getByRole('link', {
        name: 'Report the problem (opens in a new tab)',
      }),
    ).toHaveAttribute('href', 'https://github.com/KB1RMA/14cux-gauge/issues');
    await expectNoAxeViolations(page);

    await error.getByRole('button', { name: 'Reload', exact: true }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: '14CUX Gauge' }),
    ).toBeVisible();
    await expect(error).toBeHidden();
  });

  test('clears the offline copy and loads the published build', async ({
    page,
  }) => {
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() =>
        page.evaluate(() => navigator.serviceWorker.controller !== null),
      )
      .toBe(true);

    // The offline copy is now what starts the app; break it, as a device
    // that kept part of an old build would.
    await page.evaluate(async () => {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);

        for (const request of await cache.keys()) {
          if (/\/assets\/index-[^/]+\.js$/.test(request.url)) {
            await cache.put(
              request,
              new Response('throw new Error("broken offline copy");', {
                headers: { 'Content-Type': 'text/javascript' },
              }),
            );
          }
        }
      }
    });
    await page.reload();

    const error = page.getByRole('main', {
      name: '14CUX Gauge could not start',
    });

    await expect(error).toContainText(
      'The app stopped with an error while starting.',
    );
    await expect(error).toContainText('broken offline copy');

    await error
      .getByRole('button', { name: 'Clear the offline copy and reload' })
      .click();

    await expect(
      page.getByRole('heading', { level: 1, name: '14CUX Gauge' }),
    ).toBeVisible();
    await expect(error).toBeHidden();
  });
});

// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Page } from '@playwright/test';
import { expect, expectNoAxeViolations, test } from './support/fixtures';

/**
 * Cuts the network the way a garage without wifi does: nothing is reachable
 * and the browser reports it. Playwright's own `setOffline` also blocks the
 * service worker's navigations in WebKit, so it cannot show the cached copy
 * starting there.
 */
async function goOffline(page: Page): Promise<void> {
  await page.context().route('**/*', (route) =>
    // WebKit routes the page's navigation before the service worker sees it,
    // so let it through: it is still answered from the cache, and every
    // other request that is not is refused.
    route.request().isNavigationRequest()
      ? route.fallback()
      : route.abort('internetdisconnected'),
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { get: () => false });
  });
}

async function comeBackOnline(page: Page): Promise<void> {
  await page.context().unroute('**/*');
  await page.evaluate(() => {
    Reflect.deleteProperty(navigator, 'onLine');
    window.dispatchEvent(new Event('online'));
  });
}

// The app must start and work with no network, because that is how it is used
// in a garage, and it must say when it is offline or out of date.
test.describe('Progressive web app', () => {
  test('publishes a web app manifest with icons', async ({ page, request }) => {
    await page.goto('./');

    // <link> has no role; this is a check on the page head, not UI.
    // eslint-disable-next-line playwright/no-raw-locators -- see above
    const href = await page
      .locator('link[rel="manifest"]')
      .getAttribute('href');
    const response = await request.get(new URL(href ?? '', page.url()).href);

    expect(response.ok()).toBe(true);

    const manifest = (await response.json()) as {
      name: string;
      display: string;
      icons: { src: string; sizes: string }[];
    };

    expect(manifest).toMatchObject({
      name: '14CUX Gauge',
      display: 'standalone',
    });

    for (const icon of manifest.icons) {
      const file = await request.get(new URL(icon.src, response.url()).href);

      expect(file.ok(), icon.src).toBe(true);
    }
  });

  test('publishes the build it is, uncached', async ({ page, request }) => {
    await page.goto('./');

    const response = await request.get(
      new URL('version.json', page.url()).href,
    );

    expect(await response.json()).toMatchObject({
      version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
    });
  });

  test('starts and works offline once it has been loaded', async ({ page }) => {
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // The worker claims the page once it activates.
    await expect
      .poll(() =>
        page.evaluate(() => navigator.serviceWorker.controller !== null),
      )
      .toBe(true);

    await goOffline(page);
    await page.reload();

    await expect(
      page.getByRole('heading', { level: 1, name: '14CUX Gauge' }),
    ).toBeVisible();
    await expect(page.getByRole('status')).toContainText(/^Offline\. Running /);
    await expectNoAxeViolations(page);

    // Demo mode runs wholly in the page.
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await expect(
      page.getByRole('heading', { name: 'Live data' }),
    ).toBeVisible();

    await comeBackOnline(page);
    await expect(
      page.getByRole('region', { name: 'Connection' }),
    ).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: /^Offline\./ }),
    ).toBeHidden();
  });

  test('says when a newer build has been published', async ({ page }) => {
    await page.route('**/version.json', (route) =>
      route.fulfill({
        json: { version: '99.0.0', commit: null, releaseTag: 'v99.0.0' },
      }),
    );
    await page.goto('./');

    await expect(page.getByRole('status')).toContainText(
      /^v99\.0\.0 is available/,
    );
    await expectNoAxeViolations(page);
  });
});

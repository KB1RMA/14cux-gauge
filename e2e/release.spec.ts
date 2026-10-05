// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { expect, test } from './support/fixtures';

// Checks on the built bundle itself: it must work from the GitHub Pages
// sub-path, and keep the GPL's source-availability obligations.
test.describe('Release build', () => {
  test('loads every asset from the GitHub Pages sub-path', async ({ page }) => {
    const failed: string[] = [];

    page.on('response', (response) => {
      if (response.status() >= 400) {
        failed.push(`${String(response.status())} ${response.url()}`);
      }
    });
    page.on('requestfailed', (request) => failed.push(request.url()));

    await page.goto('./');

    await expect(page).toHaveTitle('14CUX Gauge');
    await expect(
      page.getByRole('heading', { level: 1, name: '14CUX Gauge' }),
    ).toBeVisible();
    expect(failed).toEqual([]);
  });

  test('ships source maps for the bundle', async ({ page, request }) => {
    await page.goto('./');

    // Script elements have no role; this is a check on the bundle, not UI.
    // eslint-disable-next-line playwright/no-raw-locators -- see above
    const scripts = await page
      .locator('script[type="module"][src]')
      .evaluateAll((elements) =>
        elements.map((element) => (element as HTMLScriptElement).src),
      );

    expect(scripts.length).toBeGreaterThan(0);

    for (const script of scripts) {
      const bundle = await request.get(script);

      expect(bundle.ok()).toBe(true);

      const mapName = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(
        await bundle.text(),
      )?.[1];

      expect(mapName, `${script} has a sourceMappingURL`).toBeDefined();

      const map = await request.get(new URL(mapName ?? '', script).href);

      expect(map.ok()).toBe(true);
      expect(await map.json()).toMatchObject({
        version: 3,
        sources: expect.arrayContaining([
          expect.stringMatching(/src\/App\.tsx$/),
        ]),
      });
    }
  });

  test('links to the source code and the licence', async ({ page }) => {
    await page.goto('./');

    const footer = page.getByRole('contentinfo');

    await expect(
      footer.getByRole('link', { name: /^Source code/ }),
    ).toHaveAttribute('href', 'https://github.com/KB1RMA/14cux-gauge');
    await expect(
      footer.getByRole('link', { name: /^GNU GPL v3/ }),
    ).toHaveAttribute('href', 'https://www.gnu.org/licenses/gpl-3.0.html');
    await expect(footer).toContainText('Provided with absolutely no warranty.');
    await expect(footer).toContainText('Not affiliated with or endorsed by');
  });

  test('shows the version and commit it was built from', async ({ page }) => {
    await page.goto('./');

    const footer = page.getByRole('contentinfo');

    // A release build names its tag; the PR and main builds do not.
    await expect(footer).toContainText(
      /(Release v|Development build of )\d+\.\d+\.\d+/,
    );
    await expect(
      footer.getByRole('link', {
        name: /^[0-9a-f]{7}\b/,
      }),
    ).toHaveAttribute(
      'href',
      /^https:\/\/github\.com\/KB1RMA\/14cux-gauge\/commit\/[0-9a-f]{40}$/,
    );
  });
});

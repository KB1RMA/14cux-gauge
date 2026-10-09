// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { expect, expectNoAxeViolations, test } from './support/fixtures';

test.describe('Live graphs', () => {
  test('draws a graph per metric, and remembers the chosen view, window and graphs', async ({
    page,
  }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await expect(
      page.getByRole('heading', { name: 'Live data' }),
    ).toBeVisible();

    // One graph for each reading the overview shows.
    const readings = await page
      .getByRole('region', { name: 'Live data' })
      .getByRole('term')
      .count();

    expect(readings).toBeGreaterThan(1);

    const tabs = page.getByRole('tablist', { name: 'Dashboard views' });

    await tabs.getByRole('tab', { name: 'Graphs' }).click();
    await expect(
      page.getByRole('heading', { name: 'Live graphs' }),
    ).toBeVisible();
    await expect(page.getByRole('figure')).toHaveCount(readings);

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
    await expect(page.getByRole('figure')).toHaveCount(readings - 1);

    await page.reload();
    await page.getByRole('button', { name: 'Demo mode' }).click();

    await expect(
      page.getByRole('heading', { name: 'Live graphs' }),
    ).toBeFocused();
    await expect(page.getByRole('radio', { name: '5 minutes' })).toBeChecked();
    await expect(page.getByRole('figure')).toHaveCount(readings - 1);
    await expect(
      page.getByRole('figure', { name: 'Fuel temp (°F)' }),
    ).toHaveCount(0);
  });

  test('shows the whole session stacked, reached from the toolbar by keyboard', async ({
    page,
  }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await page.getByRole('tab', { name: 'Graphs' }).click();

    const toolbar = page.getByRole('toolbar', { name: 'Graph options' });
    const rpm = page.getByRole('figure', { name: 'Engine speed (rpm)' });

    await toolbar.getByRole('radio', { name: '1 minute' }).focus();

    // One tab stop: the arrow keys move through the toolbar.
    for (const name of ['5 minutes', '10 minutes', 'Whole session']) {
      await page.keyboard.press('ArrowRight');
      await expect(toolbar.getByRole('radio', { name })).toBeFocused();
    }

    await page.keyboard.press('Enter');
    await expect(
      toolbar.getByRole('radio', { name: 'Whole session' }),
    ).toBeChecked();

    await toolbar.getByRole('radio', { name: 'Stacked' }).click();
    await expect(toolbar.getByRole('radio', { name: 'Stacked' })).toBeChecked();

    // Stacked, a graph spans the width of its section.
    const section = page.getByRole('region', { name: 'Engine' });
    const sectionBox = await section.boundingBox();
    const rpmBox = await rpm.boundingBox();

    expect(rpmBox?.width).toBeCloseTo(sectionBox?.width ?? 0, 0);
    // eslint-disable-next-line playwright/no-raw-locators -- a canvas has no role; it is hidden from assistive tech
    await expect(rpm.locator('canvas')).toBeVisible();
    await expect(rpm.getByRole('definition').first()).toHaveText(/^\d+ rpm$/);
    await expectNoAxeViolations(page);

    await page.reload();
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await expect(
      page.getByRole('radio', { name: 'Whole session' }),
    ).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Stacked' })).toBeChecked();
  });

  test('offers no layout switch where the grid is one column anyway', async ({
    page,
  }) => {
    // Too narrow for two 22rem columns side by side.
    await page.setViewportSize({ width: 700, height: 1024 });
    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();
    await page.getByRole('tab', { name: 'Graphs' }).click();

    const toolbar = page.getByRole('toolbar', { name: 'Graph options' });

    await expect(
      toolbar.getByRole('radiogroup', { name: 'Time window' }),
    ).toBeVisible();
    await expect(
      toolbar.getByRole('radiogroup', { name: 'Layout' }),
    ).toBeHidden();

    const engine = await page
      .getByRole('region', { name: 'Engine' })
      .boundingBox();
    const rpm = await page
      .getByRole('figure', { name: 'Engine speed (rpm)' })
      .boundingBox();

    expect(rpm?.width).toBeCloseTo(engine?.width ?? 0, 0);

    // Two columns fit, so the switch is back.
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(
      toolbar.getByRole('radiogroup', { name: 'Layout' }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
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
    await expect(
      page.getByRole('tab', { name: 'Overview', selected: true }),
    ).toBeFocused();
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

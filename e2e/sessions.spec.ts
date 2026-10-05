// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Page } from '@playwright/test';
import {
  expect,
  expectNoAxeViolations,
  reading,
  test,
} from './support/fixtures';

/** Records about two seconds of the demo ECU, and stops. */
async function recordDemo(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Demo mode' }).click();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Demo ECU · Polling · Recording',
  );
  await expect(page.getByText('0:02 recorded')).toBeVisible();
  await page.getByRole('button', { name: 'Stop recording' }).click();

  const dialog = page.getByRole('dialog', { name: 'Save recording' });

  await expect(dialog).toBeVisible();

  return dialog;
}

function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Views' });
}

test.describe('Recorded sessions', () => {
  test('records, names, keeps across a reload, replays and deletes a session', async ({
    page,
  }) => {
    const dialog = await recordDemo(page);

    await expectNoAxeViolations(page, { within: '[role="dialog"]' });
    await dialog.getByRole('textbox', { name: 'Name' }).fill('Warm idle');
    await dialog
      .getByRole('textbox', { name: 'Notes' })
      .fill('Idle settles at 750 rpm.');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Record', exact: true }),
    ).toBeVisible();

    // IndexedDB keeps it for the next visit.
    await page.reload();
    await nav(page).getByRole('button', { name: 'Sessions' }).click();
    await expect(
      page.getByRole('heading', { name: 'Recorded sessions' }),
    ).toBeFocused();
    await expect(page.getByText('Idle settles at 750 rpm.')).toBeVisible();
    await expect(reading(page, 'Length')).toHaveText(/^0:0[2-3]$/);
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Warm idle', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Warm idle' }),
    ).toBeFocused();
    await expect(reading(page, 'Engine speed')).toHaveText(/^\d+ rpm$/);

    const slider = page.getByRole('slider', { name: 'Playback position' });

    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    await page.getByRole('radio', { name: '2×' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    // Two seconds at double speed reaches the end, and stops.
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible({
      timeout: 5000,
    });
    await expect(slider).toHaveAttribute(
      'aria-valuetext',
      /^(\d+ seconds?) of \1$/,
    );

    await page.getByRole('tab', { name: 'Graphs' }).click();

    const rpm = page.getByRole('figure', { name: 'Engine speed (rpm)' });

    // eslint-disable-next-line playwright/no-raw-locators -- a canvas has no role; it is hidden from assistive tech
    await expect(rpm.locator('canvas')).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Delete session' }).click();

    const confirm = page.getByRole('alertdialog', {
      name: 'Delete this session?',
    });

    await expectNoAxeViolations(page, { within: '[role="alertdialog"]' });
    await confirm.getByRole('button', { name: 'Delete session' }).click();
    await expect(page.getByText(/^No sessions yet\./)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Recorded sessions' }),
    ).toBeFocused();
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`meets WCAG 2.2 AA, colour contrast included, in the ${colorScheme} theme`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });

      const dialog = await recordDemo(page);

      await expectNoAxeViolations(page, { within: '[role="dialog"]' });
      await dialog.getByRole('button', { name: 'Skip' }).click();
      await expect(page.getByText('0:02 recorded')).toBeHidden();

      await page.getByRole('button', { name: 'Record', exact: true }).click();
      await nav(page).getByRole('button', { name: 'Sessions' }).click();
      // The recording in progress, and the finished one.
      await expect(page.getByRole('listitem')).toHaveCount(2);
      await expect(
        page.getByRole('button', { name: /^Delete Demo ECU, / }).first(),
      ).toBeDisabled();
      await expectNoAxeViolations(page);

      await page
        .getByRole('button', { name: /^Demo ECU, / })
        .last()
        .click();
      await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }
});

// SPDX-License-Identifier: GPL-3.0-only
// Derived from libcomm14cux (https://github.com/colinbourassa/libcomm14cux)
// Copyright (C) Colin Bourassa. Licensed under the GNU GPL v3.
// ECU memory offsets and raw value encodings; written for 14cux-gauge, 2026.
import type { Page } from '@playwright/test';
import {
  choosePreferences,
  expect,
  expectNoAxeViolations,
  openPreferences,
  reading,
  test,
} from './support/fixtures';

// Raw ECU memory, planted in the emulated ECU behind the serial port. The
// expected strings are worked out by hand from these encodings.
const COOLANT_TEMP = 0x006a;

/** Thermistor count 100 is 105 °F, 40.6 °C. */
const ADC_105_F = [100];

/**
 * Sets coolant's High limit to `value` and closes Preferences, by leaving
 * the field and closing, or with Escape straight from the field.
 */
async function setCoolantHigh(
  page: Page,
  value: string,
  how: 'leave' | 'escape' = 'leave',
): Promise<void> {
  const dialog = await openPreferences(page, 'Limits');
  const high = dialog
    .getByRole('group', { name: /^Coolant/ })
    .getByRole('textbox', { name: 'High', exact: true });

  await high.fill(value);

  if (how === 'leave') {
    await high.press('Tab');
    await dialog.getByRole('button', { name: 'Close preferences' }).click();
  } else {
    await high.press('Escape');
  }

  await expect(dialog).toBeHidden();
}

test.describe('Reading limits', () => {
  test.beforeEach(async ({ page, emulatedSerial }) => {
    await page.goto('./');
    await emulatedSerial.poke(COOLANT_TEMP, ADC_105_F);
    await page.getByRole('button', { name: 'Connect to ECU' }).click();
    await expect(
      page.getByRole('region', { name: 'Connection' }).getByRole('status'),
    ).toHaveText('Serial ECU (7812 baud) · Polling');
  });

  test('mark a reading at, below and above a limit the user sets', async ({
    page,
    emulatedSerial,
  }) => {
    const live = page.getByRole('region', { name: 'Live data' });

    // Under the suggested 221 °F.
    await expect(reading(live, 'Coolant')).toHaveText('105 °F');

    await setCoolantHigh(page, '105');
    await expect(reading(live, 'Coolant')).toHaveText('105 °F hot');

    await setCoolantHigh(page, '106');
    await expect(reading(live, 'Coolant')).toHaveText('105 °F');

    await setCoolantHigh(page, '104', 'escape');
    await expect(reading(live, 'Coolant')).toHaveText('105 °F hot');

    // Dials show the same words.
    await choosePreferences(page, 'General', 'Dials');
    await expect(reading(live, 'Coolant')).toHaveText('105 °F hot');

    // Remembered after a reload.
    await page.reload();
    await emulatedSerial.poke(COOLANT_TEMP, ADC_105_F);
    await page.getByRole('button', { name: 'Connect to ECU' }).click();
    await expect(reading(live, 'Coolant')).toHaveText('105 °F hot');
  });

  test('compare the reading, not its rounded value, in °C', async ({
    page,
  }) => {
    const live = page.getByRole('region', { name: 'Live data' });

    await choosePreferences(page, 'General', 'Celsius');
    await expect(reading(live, 'Coolant')).toHaveText('41 °C');

    // 40.6 °C shows as 41 °C, but is below a 41 °C limit.
    await setCoolantHigh(page, '41');
    await expect(reading(live, 'Coolant')).toHaveText('41 °C');

    await setCoolantHigh(page, '40');
    await expect(reading(live, 'Coolant')).toHaveText('41 °C hot');
  });

  test('list the limits beside the live graph', async ({ page }) => {
    await page.getByRole('tab', { name: 'Graphs' }).click();

    const coolant = page.getByRole('figure', { name: 'Coolant (°F)' });

    await expect(reading(coolant, 'Limits')).toHaveText(
      'hot ≥ 221 °F, overheating ≥ 239 °F',
    );

    await choosePreferences(page, 'General', 'Celsius');
    await expect(
      reading(page.getByRole('figure', { name: 'Coolant (°C)' }), 'Limits'),
    ).toHaveText('hot ≥ 105 °C, overheating ≥ 115 °C');
  });

  test('pass accessibility checks in every section, with an error shown', async ({
    page,
  }) => {
    for (const section of ['General', 'Appearance'] as const) {
      await openPreferences(page, section);
      await expectNoAxeViolations(page, { within: '[role="dialog"]' });
      await page.keyboard.press('Escape');
    }

    const dialog = await openPreferences(page, 'Limits');

    await expectNoAxeViolations(page, { within: '[role="dialog"]' });

    const coolant = dialog.getByRole('group', { name: /^Coolant/ });

    await coolant
      .getByRole('textbox', { name: 'High', exact: true })
      .fill('hot');
    await coolant
      .getByRole('textbox', { name: 'High', exact: true })
      .press('Tab');
    await expect(coolant.getByRole('alert')).toHaveText(
      'High: enter a number.',
    );
    await expect(
      coolant.getByRole('textbox', { name: 'High', exact: true }),
    ).toHaveAccessibleDescription('High: enter a number.');
    await expectNoAxeViolations(page, { within: '[role="dialog"]' });
  });
});

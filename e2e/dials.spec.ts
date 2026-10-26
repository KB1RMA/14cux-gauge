// SPDX-License-Identifier: GPL-3.0-only
// Derived from libcomm14cux (https://github.com/colinbourassa/libcomm14cux)
// Copyright (C) Colin Bourassa. Licensed under the GNU GPL v3.
// ECU memory offsets and raw value encodings; written for 14cux-gauge, 2026.
import type { Page } from '@playwright/test';
import {
  expect,
  expectNoAxeViolations,
  reading,
  test,
} from './support/fixtures';

// Raw ECU memory, planted in the emulated ECU behind the serial port. The
// expected strings are worked out by hand from these encodings.
const ENGINE_SPEED_FILTERED = 0x007c;
const COOLANT_TEMP = 0x006a;
const FUEL_TEMP = 0x2006;
const ROAD_SPEED = 0x2003;

/** Pulse width 10000 (0x2710) is 7,500,000 / 10000 = 750 rpm. */
const PULSE_WIDTH_750_RPM = [0x27, 0x10];
/** Thermistor count 100 is 105 °F, 40.6 °C. */
const ADC_105_F = [100];
/** Thermistor count 195 is 32 °F, 0 °C. */
const ADC_32_F = [195];
/** 100 km/h as the ECU counts it is 62 mph (truncated): 99.78 km/h, shown as 100. */
const ROAD_SPEED_100_KMH = [100];

const PAINTS = [
  'Coniston Green',
  'Arles Blue',
  'Alpine White and Beluga Black',
  'British Racing Green',
] as const;

/** Picks options in the Preferences menu, then closes it. */
async function choose(page: Page, ...options: string[]): Promise<void> {
  await page.getByRole('button', { name: 'Preferences' }).click();

  const menu = page.getByRole('menu');

  for (const option of options) {
    await menu.getByRole('menuitemradio', { name: option }).click();
  }

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
}

test.describe('Dials', () => {
  test.beforeEach(async ({ page, emulatedSerial }) => {
    await page.goto('./');
    await emulatedSerial.poke(ENGINE_SPEED_FILTERED, PULSE_WIDTH_750_RPM);
    await emulatedSerial.poke(COOLANT_TEMP, ADC_105_F);
    await emulatedSerial.poke(FUEL_TEMP, ADC_32_F);
    await emulatedSerial.poke(ROAD_SPEED, ROAD_SPEED_100_KMH);
    await page.getByRole('button', { name: 'Connect to ECU' }).click();
    await expect(
      page.getByRole('region', { name: 'Connection' }).getByRole('status'),
    ).toHaveText('Serial ECU (7812 baud) · Polling');
  });

  test('show exactly the readings the tiles show, in the units chosen', async ({
    page,
  }) => {
    const live = page.getByRole('region', { name: 'Live data' });

    await choose(page, 'Dials');

    // The dial's scale adds nothing to the reading's text.
    await expect(reading(live, 'Engine speed')).toHaveText('750 rpm');
    await expect(reading(live, 'Coolant')).toHaveText('105 °F');
    await expect(reading(live, 'Fuel temp')).toHaveText('32 °F');
    await expect(reading(live, 'Road speed')).toHaveText('62 mph');

    // 40.6 °C rounds up, 32 °F is 0 °C, 99.78 km/h rounds to 100.
    await choose(page, 'Celsius', 'Kilometres per hour');
    await expect(reading(live, 'Coolant')).toHaveText('41 °C');
    await expect(reading(live, 'Fuel temp')).toHaveText('0 °C');
    await expect(reading(live, 'Road speed')).toHaveText('100 km/h');
    await expect(reading(live, 'Engine speed')).toHaveText('750 rpm');

    // Remembered after a reload.
    await page.reload();
    await page.getByRole('button', { name: 'Preferences' }).click();
    await expect(
      page.getByRole('menu').getByRole('menuitemradio', { name: 'Dials' }),
    ).toBeChecked();
  });

  for (const theme of ['Light', 'Dark'] as const) {
    test(`pass accessibility checks in every paint, ${theme.toLowerCase()}`, async ({
      page,
    }) => {
      const live = page.getByRole('region', { name: 'Live data' });

      await choose(page, 'Dials', theme);

      for (const paint of PAINTS) {
        await choose(page, paint);
        await expect(reading(live, 'Coolant')).toHaveText('105 °F');
        await expectNoAxeViolations(page);
      }
    });
  }
});

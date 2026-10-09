// SPDX-License-Identifier: GPL-3.0-only
// Derived from libcomm14cux (https://github.com/colinbourassa/libcomm14cux)
// Copyright (C) Colin Bourassa. Licensed under the GNU GPL v3.
// ECU memory offsets and raw value encodings; written for 14cux-gauge, 2026.
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, reading, test, type EmulatedSerial } from './support/fixtures';

const ENGINE_SPEED_FILTERED = 0x007c;
const COOLANT_TEMP = 0x006a;
const THROTTLE_POSITION = 0x005f;
const THROTTLE_MINIMUM = 0x0051;

/** Pulse width 10000 (0x2710) is 7,500,000 / 10000 = 750 rpm. */
const PULSE_WIDTH_750_RPM = [0x27, 0x10];
/** Pulse width 5000 (0x1388) is 1500 rpm. */
const PULSE_WIDTH_1500_RPM = [0x13, 0x88];
/** Thermistor count 100 is 105 °F, 40.555… °C. */
const ADC_105_F = [100];
/** 512 of 1023 above a minimum of 0: 50.048875855327466 % open. */
const THROTTLE_512 = [0x02, 0x00];

/**
 * Records a serial ECU idling at 750 rpm, then revving to 1500 rpm, and
 * saves the recording as "Rev check".
 */
async function recordRev(
  page: Page,
  emulatedSerial: EmulatedSerial,
): Promise<void> {
  await page.goto('./');
  await emulatedSerial.poke(ENGINE_SPEED_FILTERED, PULSE_WIDTH_750_RPM);
  await emulatedSerial.poke(COOLANT_TEMP, ADC_105_F);
  await emulatedSerial.poke(THROTTLE_MINIMUM, [0x00, 0x00]);
  await emulatedSerial.poke(THROTTLE_POSITION, THROTTLE_512);
  await page.getByRole('button', { name: 'Connect to ECU' }).click();
  await expect(reading(page, 'Engine speed')).toHaveText('750 rpm');

  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByText('0:01 recorded')).toBeVisible();
  await emulatedSerial.poke(ENGINE_SPEED_FILTERED, PULSE_WIDTH_1500_RPM);
  await expect(reading(page, 'Engine speed')).toHaveText('1500 rpm');
  await expect(page.getByText('0:02 recorded')).toBeVisible();
  await page.getByRole('button', { name: 'Stop recording' }).click();

  const dialog = page.getByRole('dialog', { name: 'Save recording' });

  await dialog.getByRole('textbox', { name: 'Name' }).fill('Rev check');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole('navigation', { name: 'Views' })
    .getByRole('link', { name: 'Sessions' })
    .click();
  await page.getByRole('link', { name: 'Rev check', exact: true }).click();
}

test.describe('Recorded values', () => {
  test('replays exactly what the ECU reported, at the time it reported it', async ({
    page,
    emulatedSerial,
  }) => {
    await recordRev(page, emulatedSerial);

    const position = page.getByRole('slider', { name: 'Playback position' });

    // The first sample, from before the rev.
    await expect(position).toHaveAttribute('aria-valuenow', '0');
    await expect(reading(page, 'Engine speed')).toHaveText('750 rpm');
    await expect(reading(page, 'Coolant')).toHaveText('105 °F');
    await expect(reading(page, 'Throttle')).toHaveText('50 %');

    // The last sample, after it.
    await position.focus();
    await page.keyboard.press('End');
    await expect(reading(page, 'Engine speed')).toHaveText('1500 rpm');

    await page.getByRole('tab', { name: 'Graphs' }).click();

    const rpm = page.getByRole('figure', { name: 'Engine speed (rpm)' });

    await expect(reading(rpm, 'Min')).toHaveText('750 rpm');
    await expect(reading(rpm, 'Max')).toHaveText('1500 rpm');
  });

  test('exports full-precision values, converted but not rounded', async ({
    page,
    emulatedSerial,
  }) => {
    await recordRev(page, emulatedSerial);

    const download = page.waitForEvent('download');

    await page.getByRole('button', { name: 'Export CSV' }).click();

    const lines = (await readFile(await (await download).path(), 'utf8'))
      .trimEnd()
      .split('\r\n');
    const header = lines[0]?.split(',') ?? [];
    const rows = lines.slice(1).map((line) => line.split(','));

    const column = (name: string) => {
      const index = header.indexOf(name);

      expect(index, `a "${name}" column`).toBeGreaterThan(-1);

      return rows.map((row) => row[index]);
    };

    expect(rows.length).toBeGreaterThan(1);
    expect(column('Time since start (s)')[0]).toBe('0');

    // Every sample, unrounded.
    expect(new Set(column('Throttle (%)'))).toEqual(
      new Set(['50.048875855327466']),
    );
    expect(new Set(column('Coolant (°F)'))).toEqual(new Set(['105']));

    // Each sample at its value at the time: 750 rpm, then 1500 rpm.
    const rpm = column('Engine speed (rpm)');

    expect(rpm[0]).toBe('750');
    expect(rpm.at(-1)).toBe('1500');
    expect(rpm.slice(rpm.indexOf('1500'))).not.toContain('750');

    // In °C, the conversion keeps its full precision too.
    await page.getByRole('button', { name: 'Preferences' }).click();
    await page
      .getByRole('menu')
      .getByRole('menuitemradio', { name: /Celsius/ })
      .click();
    await page.keyboard.press('Escape');

    const celsius = page.waitForEvent('download');

    await page.getByRole('button', { name: 'Export CSV' }).click();

    const text = await readFile(await (await celsius).path(), 'utf8');

    expect(text).toContain('Coolant (°C)');
    expect(text).toContain(',40.55555555555556,');
  });
});

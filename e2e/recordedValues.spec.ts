// SPDX-License-Identifier: GPL-3.0-only
// Derived from libcomm14cux (https://github.com/colinbourassa/libcomm14cux)
// Copyright (C) Colin Bourassa. Licensed under the GNU GPL v3.
// ECU memory offsets and raw value encodings; written for 14cux-gauge, 2026.
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import {
  expect,
  expectNoAxeViolations,
  reading,
  test,
  type EmulatedSerial,
} from './support/fixtures';

const ENGINE_SPEED_FILTERED = 0x007c;
const COOLANT_TEMP = 0x006a;
const THROTTLE_POSITION = 0x005f;
const THROTTLE_MINIMUM = 0x0051;
const FAULT_CODES = 0x0049;
const RPM_LIMIT = 0x200c;
const CURRENT_FUEL_MAP = 0x202c;

/** Pulse width 10000 (0x2710) is 7,500,000 / 10000 = 750 rpm. */
const PULSE_WIDTH_750_RPM = [0x27, 0x10];
/** Pulse width 5000 (0x1388) is 1500 rpm. */
const PULSE_WIDTH_1500_RPM = [0x13, 0x88];
/** Thermistor count 100 is 105 °F, 40.555… °C. */
const ADC_105_F = [100];
/** 512 of 1023 above a minimum of 0: 50.048875855327466 % open. */
const THROTTLE_512 = [0x02, 0x00];
/** A rev limit period of 1500 (0x05DC) is 7,500,000 / 1500 = 5000 rpm. */
const RPM_LIMIT_5000 = [0x05, 0xdc];
/** Fuel map 3 in use. */
const FUEL_MAP_3 = [3];
/** Byte 1 of the fault block, bit 7: purge valve leak (code 88). */
const PURGE_VALVE_LEAK = [0x00, 0x80, 0x00, 0x00, 0x00, 0x00];

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
  await emulatedSerial.poke(RPM_LIMIT, RPM_LIMIT_5000);
  await emulatedSerial.poke(CURRENT_FUEL_MAP, FUEL_MAP_3);
  await emulatedSerial.poke(FAULT_CODES, PURGE_VALVE_LEAK);
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

  test('keeps the ECU’s identity and fault codes from the start', async ({
    page,
    emulatedSerial,
  }) => {
    await recordRev(page, emulatedSerial);

    const identity = page.getByRole('region', { name: 'ECU at the start' });

    // The emulated ECU's ROM is the synthetic one: tune 1234, ident 0xDE70.
    await expect(reading(identity, 'Tune number')).toHaveText(/^1234 read /);
    await expect(reading(identity, 'Tune ident')).toHaveText(/^0xDE70 read /);
    await expect(reading(identity, 'Checksum fixer')).toHaveText(/^0xA5 read /);
    await expect(reading(identity, 'Rev limit')).toHaveText(/^5000 rpm read /);
    await expect(reading(identity, 'Fuel map')).toHaveText(/^3 read /);
    await expect(
      identity.getByRole('list', { name: 'Fault codes at the start' }),
    ).toHaveText('88 · Purge valve leak purgeValveLeak');
    await expect(identity.getByText(/Simulated/)).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('exports full-precision values, converted but not rounded', async ({
    page,
    emulatedSerial,
  }) => {
    await recordRev(page, emulatedSerial);

    const download = page.waitForEvent('download');

    await page.getByRole('button', { name: 'Export CSV' }).click();

    const all = (await readFile(await (await download).path(), 'utf8'))
      .trimEnd()
      .split('\r\n');
    // The identity rows end at a line of empty fields; every line has the
    // width of a sample row. (Some headings hold a quoted comma, so the
    // width is taken from a row of numbers.)
    const blank = all.findIndex((line) => /^,*$/.test(line));
    const width = all.at(-1)?.split(',').length;

    expect(
      all
        .filter((_, index) => index !== blank + 1)
        .map((line) => line.split(',').length),
    ).toEqual(all.slice(1).map(() => width));

    // What the recording was taken from, each with when it was read.
    expect(
      all.slice(0, blank).map((line) => line.split(',').slice(0, 2)),
    ).toEqual([
      ['ECU at start of recording', 'Value'],
      ['Source', 'Serial ECU'],
      ['Tune number', '1234'],
      ['Tune ident', '0xDE70'],
      ['Checksum fixer', '0xA5'],
      ['Rev limit (rpm)', '5000'],
      ['Fuel map', '3'],
      ['Fault code', '88 Purge valve leak (purgeValveLeak)'],
    ]);

    const lines = all.slice(blank + 1);
    const header = lines[0]?.split(',') ?? [];
    const rows = lines.slice(1).map((line) => line.split(','));

    const column = (name: string) => {
      const index = header.indexOf(name);

      expect(index, `a "${name}" column`).toBeGreaterThan(-1);

      return rows.map((row) => row[index]);
    };

    expect(rows.length).toBeGreaterThan(1);

    // Samples in the order they were read, from the start of the recording.
    const times = column('Time since start (s)').map(Number);

    expect(times[0]).toBe(0);
    expect(times).toEqual(times.toSorted((a, b) => a - b));
    expect(times.at(-1)).toBeGreaterThan(1);

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

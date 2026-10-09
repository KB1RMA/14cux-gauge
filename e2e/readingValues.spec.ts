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
  USAGE_COUNTER_HOSTS,
  type EmulatedSerial,
} from './support/fixtures';

// Raw ECU memory, planted in the emulated ECU behind the serial port. The
// expected strings are worked out by hand from these encodings.
const ENGINE_SPEED_FILTERED = 0x007c;
const COOLANT_TEMP = 0x006a;
const FUEL_TEMP = 0x2006;
const ROAD_SPEED = 0x2003;
const TARGET_IDLE = 0x2051;
const THROTTLE_POSITION = 0x005f;
const THROTTLE_MINIMUM = 0x0051;
const IDLE_BYPASS = 0x006d;

/** Pulse width 10000 (0x2710) is 7,500,000 / 10000 = 750 rpm. */
const PULSE_WIDTH_750_RPM = [0x27, 0x10];
/** Thermistor count 100 is 105 °F, 40.6 °C. */
const ADC_105_F = [100];
/** Thermistor count 195 is 32 °F, 0 °C. */
const ADC_32_F = [195];
/** Thermistor count 255, the coldest, is -13 °F, -25 °C. */
const ADC_MINUS_13_F = [255];
/** 100 km/h as the ECU counts it is 62 mph (truncated): 99.78 km/h, shown as 100. */
const ROAD_SPEED_100_KMH = [100];
/** Target idle is held in rpm: 0x02EE is 750. */
const TARGET_IDLE_750_RPM = [0x02, 0xee];
/** 512 of 1023 above a minimum of 0 is 50.05 % open. */
const THROTTLE_512 = [0x02, 0x00];
const THROTTLE_MINIMUM_0 = [0x00, 0x00];
/** Above 1023, the throttle sensor's ADC range: not a valid reading. */
const THROTTLE_OUT_OF_RANGE = [0xff, 0xff];
/** 45 steps from fully closed (180) is 75 % open. */
const IDLE_BYPASS_75_PERCENT = [45];

async function connectSerial(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Connect to ECU' }).click();
  await expect(
    page.getByRole('region', { name: 'Connection' }).getByRole('status'),
  ).toHaveText('Serial ECU (7812 baud) · Polling');
}

async function chooseUnits(
  page: Page,
  temperature: 'Celsius' | 'Fahrenheit',
  speed: 'Kilometres per hour' | 'Miles per hour',
): Promise<void> {
  await page.getByRole('button', { name: 'Preferences' }).click();

  const menu = page.getByRole('menu');

  await menu
    .getByRole('menuitemradio', { name: new RegExp(temperature) })
    .click();
  await menu.getByRole('menuitemradio', { name: new RegExp(speed) }).click();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
}

async function plantEngine(emulatedSerial: EmulatedSerial): Promise<void> {
  await emulatedSerial.poke(ENGINE_SPEED_FILTERED, PULSE_WIDTH_750_RPM);
  await emulatedSerial.poke(COOLANT_TEMP, ADC_105_F);
  await emulatedSerial.poke(FUEL_TEMP, ADC_32_F);
  await emulatedSerial.poke(ROAD_SPEED, ROAD_SPEED_100_KMH);
  await emulatedSerial.poke(TARGET_IDLE, TARGET_IDLE_750_RPM);
  await emulatedSerial.poke(THROTTLE_MINIMUM, THROTTLE_MINIMUM_0);
  await emulatedSerial.poke(THROTTLE_POSITION, THROTTLE_512);
  await emulatedSerial.poke(IDLE_BYPASS, IDLE_BYPASS_75_PERCENT);
}

test.describe('Reading values', () => {
  test('shows exactly what the ECU reports, in the units chosen', async ({
    page,
    emulatedSerial,
  }) => {
    await page.goto('./');
    await plantEngine(emulatedSerial);
    await connectSerial(page);

    const live = page.getByRole('region', { name: 'Live data' });

    await expect(reading(live, 'Engine speed')).toHaveText('750 rpm');
    await expect(reading(live, 'Target idle')).toHaveText('750 rpm');
    await expect(reading(live, 'Coolant')).toHaveText('105 °F');
    await expect(reading(live, 'Fuel temp')).toHaveText('32 °F');
    await expect(reading(live, 'Road speed')).toHaveText('62 mph');
    await expect(reading(live, 'Throttle')).toHaveText('50 %');
    await expect(reading(live, 'Idle bypass')).toHaveText('75 % open');

    // Converted from the ECU's units and rounded only for display: 40.6 °C
    // rounds up, 32 °F is 0 °C, and 62 mph (99.78 km/h) rounds to 100 km/h.
    // A value just below 0 °C showing as "0", not "-0", is a unit test in
    // src/metrics.test.ts: whole-number °F readings cannot produce one.
    await chooseUnits(page, 'Celsius', 'Kilometres per hour');
    await expect(reading(live, 'Coolant')).toHaveText('41 °C');
    await expect(reading(live, 'Fuel temp')).toHaveText('0 °C');
    await expect(reading(live, 'Road speed')).toHaveText('100 km/h');
    // Readings with no unit choice are unchanged.
    await expect(reading(live, 'Engine speed')).toHaveText('750 rpm');
    await expect(reading(live, 'Throttle')).toHaveText('50 %');

    // Below freezing in both scales.
    await emulatedSerial.poke(COOLANT_TEMP, ADC_MINUS_13_F);
    await expect(reading(live, 'Coolant')).toHaveText('-25 °C');
    await chooseUnits(page, 'Fahrenheit', 'Miles per hour');
    await expect(reading(live, 'Coolant')).toHaveText('-13 °F');
  });

  test('follows the units chosen in another window of the app', async ({
    page,
    emulatedSerial,
  }) => {
    await page.goto('./');
    await plantEngine(emulatedSerial);
    await connectSerial(page);

    const live = page.getByRole('region', { name: 'Live data' });

    await expect(reading(live, 'Coolant')).toHaveText('105 °F');
    await expect(reading(live, 'Road speed')).toHaveText('62 mph');

    // A second tab of the app, in the same browser.
    const other = await page.context().newPage();

    await other.route(USAGE_COUNTER_HOSTS, (route) => route.abort());
    await other.goto('./');
    await chooseUnits(other, 'Celsius', 'Kilometres per hour');

    // This window follows without a reload, and keeps polling.
    await expect(reading(live, 'Coolant')).toHaveText('41 °C');
    await expect(reading(live, 'Road speed')).toHaveText('100 km/h');
    await expect(reading(live, 'Engine speed')).toHaveText('750 rpm');
    await expect(
      page.getByRole('region', { name: 'Connection' }).getByRole('status'),
    ).toHaveText('Serial ECU (7812 baud) · Polling');

    await chooseUnits(other, 'Fahrenheit', 'Miles per hour');
    await expect(reading(live, 'Coolant')).toHaveText('105 °F');
    await expect(reading(live, 'Road speed')).toHaveText('62 mph');
    await other.close();
  });

  test('reads the same on the overview, the graphs and the idle air control panel', async ({
    page,
    emulatedSerial,
  }) => {
    await page.goto('./');
    await plantEngine(emulatedSerial);
    await connectSerial(page);

    const live = page.getByRole('region', { name: 'Live data' });
    const iac = page.getByRole('region', { name: 'Idle air control test' });

    await expect(reading(live, 'Idle bypass')).toHaveText('75 % open');
    await expect(reading(iac, 'Idle bypass')).toHaveText('75 % open');

    await page.getByRole('tab', { name: 'Graphs' }).click();

    const coolant = page.getByRole('figure', { name: 'Coolant (°F)' });
    const bypass = page.getByRole('figure', { name: 'Idle bypass (% open)' });

    // A steady reading: now, lowest and highest are all the ECU's value.
    for (const stat of ['Now', 'Min', 'Max']) {
      await expect(reading(coolant, stat)).toHaveText('105 °F');
      await expect(reading(bypass, stat)).toHaveText('75 % open');
    }
  });

  test('blanks an invalid reading rather than showing 0, and keeps the others', async ({
    page,
    emulatedSerial,
  }) => {
    await page.goto('./');
    await plantEngine(emulatedSerial);
    await emulatedSerial.poke(THROTTLE_POSITION, THROTTLE_OUT_OF_RANGE);
    await connectSerial(page);

    const live = page.getByRole('region', { name: 'Live data' });

    await expect(reading(live, 'Engine speed')).toHaveText('750 rpm');
    await expect(reading(live, 'Throttle')).toContainText('No valid reading');
    await expect(reading(live, 'Throttle')).not.toContainText(/\d/);
    await expectNoAxeViolations(page);

    await page.getByRole('tab', { name: 'Graphs' }).click();

    const throttle = page.getByRole('figure', { name: 'Throttle (%)' });

    await expect(reading(throttle, 'Now')).toContainText('No valid reading');
    // An invalid sample is a gap, not a 0: there is no lowest or highest yet.
    await expect(reading(throttle, 'Min')).toHaveText('—No data yet');
    await expect(reading(throttle, 'Max')).toHaveText('—No data yet');

    // Once the sensor reads again, the invalid samples still do not count.
    await emulatedSerial.poke(THROTTLE_POSITION, THROTTLE_512);
    await expect(reading(throttle, 'Now')).toHaveText('50 %');
    await expect(reading(throttle, 'Min')).toHaveText('50 %');
    await expect(reading(throttle, 'Max')).toHaveText('50 %');
  });
});

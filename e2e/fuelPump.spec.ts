// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  expect,
  expectNoAxeViolations,
  reading,
  test,
} from './support/fixtures';

/** `MemoryOffset.FuelPumpTimer` and `MemoryOffset.Port1`. */
const FUEL_PUMP_TIMER = 0x00af;
const PORT1 = 0x0002;
/** Port 1 with every bit set: the active-low pump relay (bit 6) is off. */
const PUMP_OFF = 0xff;

test.describe('Fuel pump test', () => {
  test('runs once, then continuously until stopped, only after confirmation', async ({
    page,
    emulatedSerial,
  }) => {
    await page.goto('./');
    await emulatedSerial.poke(PORT1, [PUMP_OFF]);
    await page.getByRole('button', { name: 'Connect to ECU' }).click();

    // The status bar's; the panel's result is a status too.
    const status = page
      .getByRole('region', { name: 'Connection' })
      .getByRole('status');

    await expect(status).toHaveText('Serial ECU (7812 baud) · Polling');
    await expect(reading(page, 'Fuel pump relay')).toHaveText('Off');

    // Cancel writes nothing.
    await page.getByRole('button', { name: 'Run pump (once)' }).click();

    const once = page.getByRole('alertdialog', {
      name: 'Run the fuel pump once?',
    });

    await expect(once).toContainText('pressurise the fuel rail');
    await expectNoAxeViolations(page, { within: '[role="alertdialog"]' });
    await once.getByRole('button', { name: 'Cancel' }).click();
    expect(await emulatedSerial.peek(FUEL_PUMP_TIMER, 1)).toEqual([0]);

    // Once.
    await page.getByRole('button', { name: 'Run pump (once)' }).click();
    await once.getByRole('button', { name: 'Run fuel pump' }).click();
    await expect(status).toContainText('Fuel pump running');
    await expect(reading(page, 'Fuel pump relay')).toHaveText('Running');
    expect(await emulatedSerial.peek(FUEL_PUMP_TIMER, 1)).toEqual([0xff]);
    await expect(status).toContainText('Fuel pump stopped.');

    // Continuous, stopped by the user.
    await page.getByRole('button', { name: 'Run pump (continuous)' }).click();
    await page
      .getByRole('alertdialog', { name: 'Run the fuel pump continuously?' })
      .getByRole('button', { name: 'Run fuel pump' })
      .click();
    await expect(status).toContainText('Fuel pump running');
    await expect(
      page.getByRole('button', { name: 'Stop fuel pump' }),
    ).toBeFocused();
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Stop fuel pump' }).click();
    await expect(status).toContainText('Fuel pump stopped.');
    await expect(
      page.getByRole('button', { name: 'Run pump (continuous)' }),
    ).toBeEnabled();
  });

  test('is on the demo ECU, which runs its relay for the test', async ({
    page,
  }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Demo mode' }).click();
    // The demo pump primes for two seconds when it starts.
    await expect(reading(page, 'Fuel pump relay')).toHaveText('Off', {
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Run pump (once)' }).click();
    await page
      .getByRole('alertdialog', { name: 'Run the fuel pump once?' })
      .getByRole('button', { name: 'Run fuel pump' })
      .click();
    await expect(reading(page, 'Fuel pump relay')).toHaveText('Running');
    await expect(reading(page, 'Fuel pump relay')).toHaveText('Off', {
      timeout: 10_000,
    });
  });
});

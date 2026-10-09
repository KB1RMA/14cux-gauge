// SPDX-License-Identifier: GPL-3.0-only
// Derived from libcomm14cux (https://github.com/colinbourassa/libcomm14cux)
// Copyright (C) Colin Bourassa. Licensed under the GNU GPL v3.
// ECU memory offsets and raw value encodings; written for 14cux-gauge, 2026.
import {
  expect,
  expectNoAxeViolations,
  notification,
  test,
} from './support/fixtures';

/** `MemoryOffset.Bits008A`: bit 0 is the idle air control direction. */
const BITS_008A = 0x008a;
/** `MemoryOffset.IdleAirControlStepCount`. */
const STEP_COUNT = 0x0075;
const OPEN = 0x00;
const CLOSE = 0x01;

test.describe('Idle air control test', () => {
  test('drives the motor the chosen steps and direction, only after confirmation', async ({
    page,
    emulatedSerial,
  }) => {
    await page.goto('./');
    await emulatedSerial.poke(BITS_008A, [OPEN]);
    await page.getByRole('button', { name: 'Connect to ECU' }).click();
    await expect(
      page.getByRole('region', { name: 'Connection' }).getByRole('status'),
    ).toHaveText('Serial ECU (7812 baud) · Polling');

    const panel = page.getByRole('region', { name: 'Idle air control test' });
    const steps = panel.getByRole('spinbutton', { name: 'Steps' });
    const run = panel.getByRole('button', { name: 'Run test' });

    await expectNoAxeViolations(page);

    // The step count is kept within what the ECU accepts.
    await steps.fill('300');
    await steps.blur();
    await expect(steps).toHaveValue('255');
    await steps.fill('0');
    await steps.blur();
    await expect(steps).toHaveValue('1');
    await steps.fill('');
    await expect(run).toBeDisabled();

    await steps.fill('20');
    await panel.getByRole('radio', { name: 'Close' }).check();
    await run.click();

    const confirm = page.getByRole('alertdialog', {
      name: 'Run idle air control test?',
    });

    await expect(confirm).toContainText('20 steps close');
    await expect(confirm).toContainText('writes to the ECU');
    await expectNoAxeViolations(page, { within: '[role="alertdialog"]' });

    // Cancel writes nothing.
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toBeHidden();
    expect(await emulatedSerial.peek(STEP_COUNT, 1)).toEqual([0]);
    expect(await emulatedSerial.peek(BITS_008A, 1)).toEqual([OPEN]);

    await run.click();
    await confirm.getByRole('button', { name: 'Run test' }).click();
    await expect(notification(page, 'Idle air control test')).toContainText(
      'Commanded 20 steps close.',
    );
    expect(await emulatedSerial.peek(STEP_COUNT, 1)).toEqual([20]);
    expect(await emulatedSerial.peek(BITS_008A, 1)).toEqual([CLOSE]);
    await expect(run).toBeEnabled();
  });
});

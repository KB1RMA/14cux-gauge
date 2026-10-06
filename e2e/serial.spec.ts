// SPDX-License-Identifier: GPL-3.0-only
// Derived from libcomm14cux (https://github.com/colinbourassa/libcomm14cux)
// Copyright (C) Colin Bourassa. Licensed under the GNU GPL v3.
// ECU memory offsets and raw value encodings; written for 14cux-gauge, 2026.
import { readFile } from 'node:fs/promises';
import {
  expect,
  expectNoAxeViolations,
  reading,
  test,
} from './support/fixtures';

// Raw ECU memory, planted in the emulated ECU behind the serial port.
const ENGINE_SPEED_FILTERED = 0x007c;
const FAULT_CODES = 0x0049;
const FAULT_BLOCK_SIZE = 6;
/** Pulse width 10000 (0x2710) is 7,500,000 / 10000 = 750 rpm. */
const PULSE_WIDTH_750_RPM = [0x27, 0x10];
/** Byte 1 of the fault block, bit 7: purge valve leak. */
const PURGE_VALVE_LEAK = [0x00, 0x80, 0x00, 0x00, 0x00, 0x00];

test.describe('Serial ECU over Web Serial', () => {
  test('reads live data and fault codes, and clears them in ECU memory', async ({
    page,
    emulatedSerial,
  }) => {
    await page.goto('./');
    await emulatedSerial.poke(ENGINE_SPEED_FILTERED, PULSE_WIDTH_750_RPM);
    await emulatedSerial.poke(FAULT_CODES, PURGE_VALVE_LEAK);

    await page.getByRole('button', { name: 'Connect to ECU' }).click();

    await expect(page.getByRole('status')).toHaveText(
      'Serial ECU (7812 baud) · Polling',
    );
    expect(await emulatedSerial.opens()).toEqual([
      expect.objectContaining({ baudRate: 7812 }),
    ]);
    await expect(reading(page, 'Engine speed')).toHaveText('750 rpm');
    await expect(reading(page, 'Tune number')).toHaveText('1234');
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Read fault codes' }).click();
    await expect(
      page
        .getByRole('list', { name: 'Stored fault codes' })
        .getByRole('listitem'),
    ).toHaveText(['Purge valve leak purgeValveLeak']);

    await page.getByRole('button', { name: 'Clear fault codes' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Clear fault codes' })
      .click();

    await expect(page.getByText('No fault codes stored.')).toBeVisible();
    expect(await emulatedSerial.peek(FAULT_CODES, FAULT_BLOCK_SIZE)).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
  });

  test('opens the port at 15625 baud for double-speed firmware', async ({
    page,
    emulatedSerial,
  }) => {
    await page.goto('./');
    await page
      .getByRole('checkbox', { name: 'Double-speed firmware (15625 baud)' })
      .check();
    await page.getByRole('button', { name: 'Connect to ECU' }).click();

    await expect(page.getByRole('status')).toHaveText(
      'Serial ECU (15625 baud) · Polling',
    );
    expect(await emulatedSerial.opens()).toEqual([
      expect.objectContaining({ baudRate: 15625 }),
    ]);
  });

  test('offers to reconnect when the cable is unplugged', async ({
    page,
    emulatedSerial,
  }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Connect to ECU' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Serial ECU (7812 baud) · Polling',
    );

    await emulatedSerial.unplug();

    const reconnect = page.getByRole('button', { name: 'Reconnect' });

    await expect(reconnect).toBeFocused();
    await expect(page.getByRole('status')).toHaveText(
      'Disconnected: The serial port could not be opened or was disconnected. Another program may be using it.',
    );
    await expectNoAxeViolations(page);

    await reconnect.click();
    await expect(page.getByRole('status')).toHaveText(
      'Serial ECU (7812 baud) · Polling',
    );
    expect(await emulatedSerial.opens()).toHaveLength(2);
  });

  test('reports an ECU that stops responding', async ({
    page,
    emulatedSerial,
  }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Connect to ECU' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Serial ECU (7812 baud) · Polling',
    );

    await emulatedSerial.setSilent(true);

    await expect(page.getByRole('status')).toHaveText(
      'Disconnected: The ECU stopped responding. Check the cable, that the ignition is on, and that the baud rate matches the ECU firmware.',
    );
    await expect(page.getByRole('button', { name: 'Reconnect' })).toBeFocused();
  });

  test('saves a diagnostic log of the serial traffic for remote debugging', async ({
    page,
    emulatedSerial,
  }) => {
    await page.goto('./');
    await emulatedSerial.poke(ENGINE_SPEED_FILTERED, PULSE_WIDTH_750_RPM);
    await page.getByRole('button', { name: 'Connect to ECU' }).click();
    await expect(reading(page, 'Engine speed')).toHaveText('750 rpm');

    const trouble = page.getByRole('region', { name: 'Having trouble?' });

    await expect(trouble).toHaveCount(0);

    await emulatedSerial.setSilent(true);
    await expect(page.getByRole('button', { name: 'Reconnect' })).toBeFocused();
    await expect(trouble).toBeVisible();
    await expectNoAxeViolations(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      trouble.getByRole('button', { name: 'Download diagnostic log' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(
      /^14cux-gauge-log-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.txt$/,
    );

    const log = await readFile(await download.path(), 'utf8');

    expect(log).toContain('Connecting to a serial ECU');
    expect(log).toContain('7812 baud, 8N1, no flow control');
    // The engine speed read: the command for 0x007C, then the planted bytes.
    expect(log).toMatch(
      /TX {2}04\n.*RX {2}04 .*\n.*TX {2}01\n.*RX {2}01 .*\n.*TX {2}FC\n.*RX {2}27 10 /,
    );
    expect(log).toMatch(
      /ERR Polling pass failed \(1 in a row\), retrying: TimeoutError: /,
    );
    expect(log).toMatch(/ERR Connection failed: TimeoutError: /);
  });

  test('stays on the connect screen when the port picker is dismissed', async ({
    page,
    emulatedSerial,
  }) => {
    await page.goto('./');
    await emulatedSerial.choosePort('cancel');
    await page.getByRole('button', { name: 'Connect to ECU' }).click();

    await expect(
      page.getByRole('heading', { name: 'Connect to an ECU' }),
    ).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await emulatedSerial.opens()).toEqual([]);
  });
});

test.describe('Browser without Web Serial', () => {
  test('explains the limitation and still offers demo mode', async ({
    page,
    withoutWebSerial: _,
  }) => {
    await page.goto('./');

    await expect(page.getByRole('note')).toContainText(
      "This browser can't talk to serial ports.",
    );
    await expect(
      page.getByRole('button', { name: 'Connect to ECU' }),
    ).toHaveCount(0);
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Demo mode' }).click();
    await expect(page.getByRole('status')).toHaveText('Demo ECU · Polling');
  });
});

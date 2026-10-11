// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryOffset, SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { expectNoAxeViolations } from '../test-support/a11y';
import { connectedSession } from '../test-support/ecuSession';
import { WriteHarness } from '../test-support/WriteHarness';
import { FaultCodes } from './FaultCodes';

async function sessionWithFaults() {
  const transport = new SimulatedTransport();

  transport.memory[MemoryOffset.FaultCodes] = 0x02; // lambda sensor, odd bank
  transport.memory[MemoryOffset.FaultCodes + 1] = 0x80; // purge valve leak

  const { session } = await connectedSession(transport);

  return { transport, session };
}

function faultBlock(transport: SimulatedTransport): number[] {
  return [
    ...transport.memory.subarray(
      MemoryOffset.FaultCodes,
      MemoryOffset.FaultCodes + 6,
    ),
  ];
}

describe('FaultCodes', () => {
  it('lists the active fault codes on demand', async () => {
    const user = userEvent.setup();
    const { session } = await sessionWithFaults();

    render(
      <WriteHarness session={session}>
        <FaultCodes />
      </WriteHarness>,
    );

    expect(screen.getByText('Not read yet.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Read fault codes' }));

    const items = within(
      await screen.findByRole('list', { name: 'Stored fault codes' }),
    ).getAllByRole('listitem');

    expect(items.map((item) => item.textContent)).toEqual([
      '44 · Lambda sensor, odd bank lambdaSensorOdd',
      '88 · Purge valve leak purgeValveLeak',
    ]);
  });

  it('shows the factory code number beside every fault, in priority order', async () => {
    const user = userEvent.setup();
    const transport = new SimulatedTransport();

    // Every bit set, spare bits included: spare bits must not show as faults.
    transport.memory.fill(
      0xff,
      MemoryOffset.FaultCodes,
      MemoryOffset.FaultCodes + 6,
    );

    const { session } = await connectedSession(transport);

    render(
      <WriteHarness session={session}>
        <FaultCodes />
      </WriteHarness>,
    );
    await user.click(screen.getByRole('button', { name: 'Read fault codes' }));

    const items = within(
      await screen.findByRole('list', { name: 'Stored fault codes' }),
    ).getAllByRole('listitem');

    // Numbers from the firmware's fault table, one byte of 0x0049–0x004E at a
    // time, least significant bit first.
    expect(items.map((item) => item.textContent)).toEqual([
      '29 · ROM checksum failure romChecksumFailure',
      '44 · Lambda sensor, odd bank lambdaSensorOdd',
      '45 · Lambda sensor, even bank lambdaSensorEven',
      '25 · Misfire (set only by firmware before R3360) misfireGeneral',
      '40 · Misfire, odd bank misfireOddBank',
      '50 · Misfire, even bank misfireEvenBank',
      '12 · Airflow meter airflowMeter',
      '21 · Tune resistor out of range tuneResistorOutOfRange',
      '34 · Injector, odd bank injectorOddBank',
      '36 · Injector, even bank injectorEvenBank',
      '14 · Coolant temperature sensor coolantTempSensor',
      '17 · Throttle potentiometer throttlePot',
      '18 · Throttle pot high / MAF low throttlePotHiMafLo',
      '19 · Throttle pot low / MAF high throttlePotLoMafHi',
      '88 · Purge valve leak purgeValveLeak',
      '26 · Mixture too lean mixtureTooLean',
      '28 · Intake air leak intakeAirLeak',
      '23 · Low fuel pressure lowFuelPressure',
      '48 · Idle valve stepper motor idleValveStepperMotor',
      '68 · Road speed sensor roadSpeedSensor',
      '69 · Neutral switch neutralSwitch',
      '59 · Low fuel pressure or air leak lowFuelPressureOrAirLeak',
      '15 · Fuel temperature sensor fuelTempSensor',
      '02 · Battery disconnected batteryDisconnected',
      '03 · RAM checksum failure ramChecksumFailure',
    ]);
  });

  it('shows code 25 for a misfire set by older firmware', async () => {
    const user = userEvent.setup();
    const transport = new SimulatedTransport();

    transport.memory[MemoryOffset.FaultCodes] = 0x08; // bit 3: code 25

    const { session } = await connectedSession(transport);

    render(
      <WriteHarness session={session}>
        <FaultCodes />
      </WriteHarness>,
    );
    await user.click(screen.getByRole('button', { name: 'Read fault codes' }));

    const items = within(
      await screen.findByRole('list', { name: 'Stored fault codes' }),
    ).getAllByRole('listitem');

    expect(items.map((item) => item.textContent)).toEqual([
      '25 · Misfire (set only by firmware before R3360) misfireGeneral',
    ]);
  });

  it('clears the codes in ECU memory only after confirmation', async () => {
    const user = userEvent.setup();
    const { transport, session } = await sessionWithFaults();

    render(
      <WriteHarness session={session}>
        <FaultCodes />
      </WriteHarness>,
    );

    await user.click(screen.getByRole('button', { name: 'Clear fault codes' }));

    const dialog = screen.getByRole('alertdialog', {
      name: 'Clear fault codes?',
    });

    expect(dialog).toHaveTextContent(/no warranty/);
    expect(faultBlock(transport)).toEqual([0x02, 0x80, 0, 0, 0, 0]);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(faultBlock(transport)).toEqual([0x02, 0x80, 0, 0, 0, 0]);

    await user.click(screen.getByRole('button', { name: 'Clear fault codes' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Clear fault codes',
      }),
    );

    expect(
      await screen.findByText('No fault codes stored.'),
    ).toBeInTheDocument();
    expect(faultBlock(transport)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('cancels the confirmation with Escape', async () => {
    const user = userEvent.setup();
    const { transport, session } = await sessionWithFaults();

    render(
      <WriteHarness session={session}>
        <FaultCodes />
      </WriteHarness>,
    );
    await user.click(screen.getByRole('button', { name: 'Clear fault codes' }));

    expect(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      }),
    ).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(faultBlock(transport)[1]).toBe(0x80);
  });

  it('returns focus to the button that opened the confirmation', async () => {
    const user = userEvent.setup();
    const { session } = await sessionWithFaults();

    render(
      <WriteHarness session={session}>
        <FaultCodes />
      </WriteHarness>,
    );

    const clear = screen.getByRole('button', { name: 'Clear fault codes' });

    await user.click(clear);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(clear).toHaveFocus();
  });

  it('has no detectable accessibility violations with codes listed and the dialog open', async () => {
    const user = userEvent.setup();
    const { session } = await sessionWithFaults();
    const { container } = render(
      <WriteHarness session={session}>
        <FaultCodes />
      </WriteHarness>,
    );

    await user.click(screen.getByRole('button', { name: 'Read fault codes' }));
    await screen.findByRole('list', { name: 'Stored fault codes' });
    await user.click(screen.getByRole('button', { name: 'Clear fault codes' }));

    await expectNoAxeViolations(container);
  });

  it('shows an error when the ECU does not answer', async () => {
    const user = userEvent.setup();
    const { transport, session } = await sessionWithFaults();

    transport.silent = true;
    render(
      <WriteHarness session={session}>
        <FaultCodes />
      </WriteHarness>,
    );
    await user.click(screen.getByRole('button', { name: 'Read fault codes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The ECU stopped responding.',
    );
  });
});

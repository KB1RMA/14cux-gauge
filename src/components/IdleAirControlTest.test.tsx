// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Ecu, MemoryOffset, SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { expectNoAxeViolations } from '../test-support/a11y';
import { snapshotAt } from '../test-support/snapshots';
import { WriteHarness } from '../test-support/WriteHarness';
import { IdleAirControlTest } from './IdleAirControlTest';

async function setup(bits = 0b1010_1010) {
  const transport = new SimulatedTransport();

  transport.memory[MemoryOffset.Bits008A] = bits;

  const ecu = new Ecu(transport);

  await ecu.connect();

  const ui = (
    <WriteHarness ecu={ecu}>
      <IdleAirControlTest snapshot={snapshotAt(0, { idleBypass: 0.5 })} />
    </WriteHarness>
  );

  return { transport, ui };
}

function panel() {
  return within(screen.getByRole('region', { name: 'Idle air control test' }));
}

async function setSteps(user: ReturnType<typeof userEvent.setup>, to: string) {
  const input = screen.getByRole('spinbutton', { name: 'Steps' });

  await user.clear(input);
  await user.type(input, to);
}

describe('IdleAirControlTest', () => {
  it('shows the idle bypass position beside the control', async () => {
    const { ui } = await setup();

    render(ui);

    expect(screen.getByText('Idle bypass').nextSibling).toHaveTextContent(
      '50 % open',
    );
  });

  it('writes nothing until the dialog is confirmed, then opens the valve', async () => {
    const user = userEvent.setup();
    const { transport, ui } = await setup();

    render(ui);
    await setSteps(user, '25');
    await user.click(screen.getByRole('button', { name: 'Run test' }));

    const dialog = screen.getByRole('alertdialog', {
      name: 'Run idle air control test?',
    });

    expect(dialog).toHaveTextContent(/25 steps open/);
    expect(dialog).toHaveTextContent(/re-adjust the motor/);
    expect(dialog).toHaveTextContent(/no warranty/);
    expect(transport.memory[MemoryOffset.IdleAirControlStepCount]).toBe(0);

    await user.click(within(dialog).getByRole('button', { name: 'Run test' }));

    expect(await panel().findByText('Commanded 25 steps open.')).toBeVisible();
    expect(transport.memory[MemoryOffset.IdleAirControlStepCount]).toBe(25);
    expect(transport.memory[MemoryOffset.Bits008A]).toBe(0b1010_1010);
  });

  it('closes the valve by setting the direction bit', async () => {
    const user = userEvent.setup();
    const { transport, ui } = await setup();

    render(ui);
    await user.click(screen.getByRole('radio', { name: 'Close' }));
    await setSteps(user, '1');
    await user.click(screen.getByRole('button', { name: 'Run test' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Run test',
      }),
    );

    expect(await panel().findByText('Commanded 1 step close.')).toBeVisible();
    expect(transport.memory[MemoryOffset.IdleAirControlStepCount]).toBe(1);
    expect(transport.memory[MemoryOffset.Bits008A]).toBe(0b1010_1011);
  });

  it('writes nothing when cancelled', async () => {
    const user = userEvent.setup();
    const { transport, ui } = await setup();

    render(ui);
    await user.click(screen.getByRole('button', { name: 'Run test' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(transport.memory[MemoryOffset.IdleAirControlStepCount]).toBe(0);
  });

  it('clamps the step count to 1..255 and blocks an empty one', async () => {
    const user = userEvent.setup();
    const { ui } = await setup();

    render(ui);

    const input = screen.getByRole('spinbutton', { name: 'Steps' });

    await setSteps(user, '999');
    await user.tab();
    expect(input).toHaveValue(255);

    await setSteps(user, '0');
    await user.tab();
    expect(input).toHaveValue(1);

    await user.clear(input);
    expect(screen.getByRole('button', { name: 'Run test' })).toBeDisabled();
  });

  it('shows an error when the ECU does not answer', async () => {
    const user = userEvent.setup();
    const { transport, ui } = await setup();

    render(ui);
    transport.silent = true;
    await user.click(screen.getByRole('button', { name: 'Run test' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Run test',
      }),
    );

    expect(
      await panel().findByText(
        /^The idle air control test may have partly run\. The ECU stopped responding\./,
      ),
    ).toBeInTheDocument();
  });

  it('has no accessibility violations, with the dialog open', async () => {
    const user = userEvent.setup();
    const { ui } = await setup();
    const { container } = render(ui);

    await expectNoAxeViolations(container);
    await user.click(screen.getByRole('button', { name: 'Run test' }));
    await expectNoAxeViolations(container);
  });
});

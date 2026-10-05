// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Ecu, MemoryOffset, SimulatedTransport } from 'comm14cux-ts';
import { expectNoAxeViolations } from '../test-support/a11y';
import { FaultCodes } from './FaultCodes';

async function ecuWithFaults() {
  const transport = new SimulatedTransport();

  transport.memory[MemoryOffset.FaultCodes] = 0x02; // lambda sensor, odd bank
  transport.memory[MemoryOffset.FaultCodes + 1] = 0x80; // purge valve leak

  const ecu = new Ecu(transport);

  await ecu.connect();

  return { transport, ecu };
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
    const { ecu } = await ecuWithFaults();

    render(<FaultCodes ecu={ecu} />);

    expect(screen.getByText('Not read yet.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Read fault codes' }));

    const items = within(
      await screen.findByRole('list', { name: 'Stored fault codes' }),
    ).getAllByRole('listitem');

    expect(items.map((item) => item.textContent)).toEqual([
      'Lambda sensor, odd bank lambdaSensorOdd',
      'Purge valve leak purgeValveLeak',
    ]);
  });

  it('clears the codes in ECU memory only after confirmation', async () => {
    const user = userEvent.setup();
    const { transport, ecu } = await ecuWithFaults();

    render(<FaultCodes ecu={ecu} />);

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
    const { transport, ecu } = await ecuWithFaults();

    render(<FaultCodes ecu={ecu} />);
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
    const { ecu } = await ecuWithFaults();

    render(<FaultCodes ecu={ecu} />);

    const clear = screen.getByRole('button', { name: 'Clear fault codes' });

    await user.click(clear);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(clear).toHaveFocus();
  });

  it('has no detectable accessibility violations with codes listed and the dialog open', async () => {
    const user = userEvent.setup();
    const { ecu } = await ecuWithFaults();
    const { container } = render(<FaultCodes ecu={ecu} />);

    await user.click(screen.getByRole('button', { name: 'Read fault codes' }));
    await screen.findByRole('list', { name: 'Stored fault codes' });
    await user.click(screen.getByRole('button', { name: 'Clear fault codes' }));

    await expectNoAxeViolations(container);
  });

  it('shows an error when the ECU does not answer', async () => {
    const user = userEvent.setup();
    const { transport, ecu } = await ecuWithFaults();

    transport.silent = true;
    render(<FaultCodes ecu={ecu} />);
    await user.click(screen.getByRole('button', { name: 'Read fault codes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The ECU stopped responding.',
    );
  });
});

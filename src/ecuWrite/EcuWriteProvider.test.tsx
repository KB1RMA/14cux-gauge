// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { MemoryOffset, SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FaultCodes } from '../components/FaultCodes';
import { FuelPumpTest } from '../components/FuelPumpTest';
import { IdleAirControlTest } from '../components/IdleAirControlTest';
import { LatencyTransport } from '../demo/latencyTransport';
import type { EcuSession } from '../ecu/session';
import { expectNoAxeViolations } from '../test-support/a11y';
import { connectedSession } from '../test-support/ecuSession';
import { notification } from '../test-support/notifications';
import { WriteHarness } from '../test-support/WriteHarness';

const BLOCKED = 'Disabled while another write to the ECU runs: Fuel pump test.';

/** Stops answering once the first fault code byte has been cleared. */
class FailsAfterFirstClear extends SimulatedTransport {
  override async write(data: Uint8Array): Promise<void> {
    await super.write(data);

    if (this.memory[MemoryOffset.FaultCodes] === 0) {
      this.silent = true;
    }
  }
}

/** The link drops once the first fault code byte has been cleared. */
class ClosesAfterFirstClear extends SimulatedTransport {
  override async write(data: Uint8Array): Promise<void> {
    await super.write(data);

    if (this.memory[MemoryOffset.FaultCodes] === 0) {
      await this.close();
    }
  }
}

function connect(transport: SimulatedTransport | LatencyTransport) {
  return connectedSession(transport);
}

function withFaults<T extends SimulatedTransport>(transport: T): T {
  transport.memory[MemoryOffset.FaultCodes] = 0x02;
  transport.memory[MemoryOffset.FaultCodes + 1] = 0x80;
  transport.memory[MemoryOffset.Port1] = 0xff;

  return transport;
}

function faultBlock(transport: SimulatedTransport): number[] {
  return [
    ...transport.memory.subarray(
      MemoryOffset.FaultCodes,
      MemoryOffset.FaultCodes + 6,
    ),
  ];
}

function Panels({ session }: { session: EcuSession }) {
  return (
    <WriteHarness session={session}>
      <FaultCodes />
      <FuelPumpTest />
      <IdleAirControlTest />
    </WriteHarness>
  );
}

function panel(name: string) {
  return within(screen.getByRole('region', { name }));
}

function announcement(): string | null {
  return screen.getByRole('status', { name: 'Write announcement' }).textContent;
}

describe('ECU writes', () => {
  it('disables every other write, and says why, while one runs', async () => {
    const user = userEvent.setup();
    const transport = withFaults(new SimulatedTransport());
    const { session } = await connect(transport);

    render(<Panels session={session} />);
    await user.click(
      screen.getByRole('button', { name: 'Run pump (continuous)' }),
    );
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Run fuel pump',
      }),
    );

    expect(announcement()).toBe('Fuel pump running');
    expect(notification('Fuel pump test')).toHaveTextContent(
      'Fuel pump running',
    );

    const clear = screen.getByRole('button', { name: 'Clear fault codes' });
    const iac = screen.getByRole('button', { name: 'Run test' });

    expect(clear).toBeDisabled();
    expect(clear).toHaveAccessibleDescription(BLOCKED);
    expect(iac).toBeDisabled();
    expect(iac).toHaveAccessibleDescription(BLOCKED);
    // The test's own controls do not claim another write holds them.
    expect(
      screen.getByRole('button', { name: 'Run pump (once)' }),
    ).not.toHaveAccessibleDescription();
    // Reading is not a write.
    expect(
      screen.getByRole('button', { name: 'Read fault codes' }),
    ).toBeEnabled();
    await expectNoAxeViolations(document.body);

    await user.click(screen.getByRole('button', { name: 'Stop fuel pump' }));

    // The pump runs on for about two seconds, and holds the ECU until then.
    expect(announcement()).toBe('Fuel pump running');
    expect(clear).toBeDisabled();
    expect(clear).toHaveAccessibleDescription(BLOCKED);
    expect(iac).toBeDisabled();

    await waitFor(() => {
      expect(announcement()).toBe('Fuel pump stopped.');
    });
    expect(clear).toBeEnabled();
    expect(clear).not.toHaveAccessibleDescription();
    expect(iac).toBeEnabled();
    expect(screen.queryByText(BLOCKED)).not.toBeInTheDocument();
    expect(faultBlock(transport)).toEqual([0x02, 0x80, 0, 0, 0, 0]);
  });

  it('reports a write that fails part-way as possibly incomplete', async () => {
    const user = userEvent.setup();
    const transport = withFaults(new FailsAfterFirstClear());
    const { session } = await connect(transport);

    render(<Panels session={session} />);
    await user.click(screen.getByRole('button', { name: 'Clear fault codes' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Clear fault codes',
      }),
    );

    expect(
      await panel('Fault codes').findByText(
        /^Clearing may be incomplete\. The ECU stopped responding\./,
      ),
    ).toBeInTheDocument();
    expect(notification('Clear fault codes')).toHaveTextContent(
      /Clearing may be incomplete\. The ECU stopped responding\./,
    );
    expect(announcement()).toMatch(/^Clearing may be incomplete\./);
    // The first byte was cleared; the second was not.
    expect(faultBlock(transport)).toEqual([0, 0x80, 0, 0, 0, 0]);
    // The next write may run.
    expect(
      screen.getByRole('button', { name: 'Clear fault codes' }),
    ).toBeEnabled();
  });

  it('reports a write as possibly incomplete when the link drops part-way', async () => {
    const user = userEvent.setup();
    const transport = withFaults(new ClosesAfterFirstClear());
    const { session } = await connect(transport);

    render(<Panels session={session} />);
    await user.click(screen.getByRole('button', { name: 'Clear fault codes' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Clear fault codes',
      }),
    );

    expect(
      await panel('Fault codes').findByText(
        'Clearing may be incomplete. The connection to the ECU was closed.',
      ),
    ).toBeInTheDocument();
    expect(faultBlock(transport)).toEqual([0, 0x80, 0, 0, 0, 0]);
  });

  it('says nothing was written when the connection had already closed', async () => {
    const user = userEvent.setup();
    const transport = new SimulatedTransport();
    const { session, ecu } = await connect(transport);

    render(<Panels session={session} />);
    await ecu.disconnect();
    await user.click(screen.getByRole('button', { name: 'Run test' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Run test',
      }),
    );

    expect(
      await panel('Idle air control test').findByText(
        'The idle air control test did not run. The connection to the ECU was closed.',
      ),
    ).toBeInTheDocument();
    expect(notification('Idle air control test')).toHaveTextContent(
      'The idle air control test did not run. The connection to the ECU was closed.',
    );
    expect(transport.memory[MemoryOffset.IdleAirControlStepCount]).toBe(0);
  });

  it('keeps a write running, and its result, when the user leaves the view', async () => {
    const user = userEvent.setup();
    const transport = new SimulatedTransport();
    const { session } = await connect(
      new LatencyTransport(transport, { perReadMs: 40, perByteMs: 0 }),
    );

    render(<Panels session={session} />);
    await user.click(screen.getByRole('button', { name: 'Run test' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Run test',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Leave view' }));

    expect(announcement()).toBe('Idle air control test running');

    await user.click(screen.getByRole('button', { name: 'Return to view' }));

    // Still running: the panel came back with Run disabled.
    expect(screen.getByRole('button', { name: 'Running…' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Leave view' }));

    await waitFor(() => {
      expect(announcement()).toBe('Commanded 10 steps open.');
    });
    expect(transport.memory[MemoryOffset.IdleAirControlStepCount]).toBe(10);

    await user.click(screen.getByRole('button', { name: 'Return to view' }));

    expect(
      panel('Idle air control test').getByText('Commanded 10 steps open.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run test' })).toBeEnabled();
  });

  it('forgets writes when the connection goes', async () => {
    const user = userEvent.setup();
    const { session } = await connect(withFaults(new SimulatedTransport()));

    render(<Panels session={session} />);
    await user.click(screen.getByRole('button', { name: 'Clear fault codes' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Clear fault codes',
      }),
    );
    await waitFor(() => {
      expect(announcement()).toBe('Fault codes cleared.');
    });
    expect(
      panel('Fault codes').getByText('Fault codes cleared.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Drop link' }));

    expect(announcement()).toBe('none');
    expect(
      panel('Fault codes').queryByText('Fault codes cleared.'),
    ).not.toBeInTheDocument();
    // The notification reports what happened, so it outlives the connection.
    expect(notification('Clear fault codes')).toHaveTextContent(
      'Fault codes cleared.',
    );
  });
});

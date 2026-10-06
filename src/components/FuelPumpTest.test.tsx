// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Ecu, MemoryOffset, SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expectNoAxeViolations } from '../test-support/a11y';
import { WriteHarness } from '../test-support/WriteHarness';
import { FuelPumpTest } from './FuelPumpTest';

const PORT1_IDLE = 0xff;

async function connectedEcu() {
  const transport = new SimulatedTransport();

  transport.memory[MemoryOffset.Port1] = PORT1_IDLE;

  const ecu = new Ecu(transport);

  await ecu.connect();

  return { transport, ecu };
}

function Harness({ ecu }: { ecu: Ecu }) {
  return (
    <WriteHarness ecu={ecu}>
      <FuelPumpTest />
    </WriteHarness>
  );
}

/**
 * Fake timers, and `click` instead of user-event: Testing Library waits on a
 * real timer after each user-event call, which never fires under fake ones.
 */
function setup() {
  vi.useFakeTimers();
}

async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
}

/** Clears what the last run wrote, so the next one can be seen. */
function clearPump(transport: SimulatedTransport) {
  transport.memory[MemoryOffset.FuelPumpTimer] = 0;
  transport.memory[MemoryOffset.Port1] = PORT1_IDLE;
}

function pumpWritten(transport: SimulatedTransport): boolean {
  return (
    transport.memory[MemoryOffset.FuelPumpTimer] === 0xff &&
    transport.memory[MemoryOffset.Port1] === 0xbf
  );
}

async function confirm(open: string, title: string) {
  await click(screen.getByRole('button', { name: open }));

  const dialog = screen.getByRole('alertdialog', { name: title });

  await click(within(dialog).getByRole('button', { name: 'Run fuel pump' }));
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function running(): string | null {
  return screen.getByRole('status', { name: 'Running write' }).textContent;
}

function announcement(): string | null {
  return screen.getByRole('status', { name: 'Write announcement' }).textContent;
}

describe('FuelPumpTest accessibility', () => {
  it('has no violations, with the confirmation open or closed', async () => {
    const user = userEvent.setup();
    const { ecu } = await connectedEcu();
    const { container } = render(<Harness ecu={ecu} />);

    await expectNoAxeViolations(container);
    await user.click(
      screen.getByRole('button', { name: 'Run pump (continuous)' }),
    );
    await expectNoAxeViolations(
      screen.getByRole('alertdialog', {
        name: 'Run the fuel pump continuously?',
      }),
    );
  });
});

describe('FuelPumpTest', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes nothing until the risk is confirmed, and nothing if cancelled', async () => {
    const { transport, ecu } = await connectedEcu();
    setup();

    render(<Harness ecu={ecu} />);
    await click(screen.getByRole('button', { name: 'Run pump (once)' }));

    const dialog = screen.getByRole('alertdialog', {
      name: 'Run the fuel pump once?',
    });

    expect(dialog).toHaveTextContent('pressurise the fuel rail');
    expect(dialog).toHaveTextContent('check the fuel system for leaks');
    expect(dialog).toHaveTextContent('keep sources of ignition away');
    await click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await advance(5000);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(transport.memory[MemoryOffset.FuelPumpTimer]).toBe(0);
    expect(transport.memory[MemoryOffset.Port1]).toBe(PORT1_IDLE);
    expect(running()).toBe('none');
    expect(announcement()).toBe('none');
  });

  it('runs the pump once: writes the timer and relay bit, then reports it stopped', async () => {
    const { transport, ecu } = await connectedEcu();
    setup();

    render(<Harness ecu={ecu} />);
    await confirm('Run pump (once)', 'Run the fuel pump once?');
    await advance(10);

    expect(pumpWritten(transport)).toBe(true);
    expect(running()).toBe('fuelPump');
    expect(announcement()).toBe('Fuel pump running');
    expect(
      screen.getByRole('button', { name: 'Run pump (once)' }),
    ).toBeDisabled();

    clearPump(transport);
    await advance(10_000);

    // One run only: it was not renewed.
    expect(pumpWritten(transport)).toBe(false);
    expect(running()).toBe('none');
    expect(announcement()).toBe('Fuel pump stopped.');
    expect(
      within(screen.getByRole('region', { name: 'Fuel pump test' })).getByRole(
        'status',
      ),
    ).toHaveTextContent('Fuel pump stopped.');
    expect(
      screen.getByRole('button', { name: 'Run pump (once)' }),
    ).toBeEnabled();
  });

  it('keeps renewing the pump until Stop is pressed', async () => {
    const { transport, ecu } = await connectedEcu();
    setup();

    render(<Harness ecu={ecu} />);
    await confirm('Run pump (continuous)', 'Run the fuel pump continuously?');
    await advance(10);
    expect(pumpWritten(transport)).toBe(true);

    for (let renewals = 0; renewals < 3; renewals++) {
      clearPump(transport);
      await advance(1500);
      expect(pumpWritten(transport)).toBe(true);
    }

    const stop = screen.getByRole('button', { name: 'Stop fuel pump' });

    await click(stop);
    clearPump(transport);
    await advance(10_000);

    expect(pumpWritten(transport)).toBe(false);
    expect(announcement()).toBe('Fuel pump stopped.');
    expect(
      screen.getByRole('button', { name: 'Run pump (continuous)' }),
    ).toBeEnabled();
  });

  it('stops by itself after two minutes', async () => {
    const { transport, ecu } = await connectedEcu();
    setup();

    render(<Harness ecu={ecu} />);
    await confirm('Run pump (continuous)', 'Run the fuel pump continuously?');
    await advance(119_000);
    expect(running()).toBe('fuelPump');
    await advance(1_100);

    expect(running()).toBe('none');
    expect(announcement()).toBe(
      'Fuel pump stopped at its 2 minute time limit.',
    );

    clearPump(transport);
    await advance(10_000);
    expect(pumpWritten(transport)).toBe(false);
  });

  it('stops when the connection goes', async () => {
    const { transport, ecu } = await connectedEcu();
    setup();

    render(<Harness ecu={ecu} />);
    await confirm('Run pump (continuous)', 'Run the fuel pump continuously?');
    await advance(10);
    await click(screen.getByRole('button', { name: 'Drop link' }));
    clearPump(transport);
    await advance(10_000);

    expect(pumpWritten(transport)).toBe(false);
    expect(running()).toBe('none');
    expect(announcement()).toBe('none');
  });

  it('stops when the user leaves the view', async () => {
    const { transport, ecu } = await connectedEcu();
    setup();

    render(<Harness ecu={ecu} />);
    await confirm('Run pump (continuous)', 'Run the fuel pump continuously?');
    await advance(10);
    await click(screen.getByRole('button', { name: 'Leave view' }));
    clearPump(transport);
    await advance(10_000);

    expect(pumpWritten(transport)).toBe(false);
    expect(announcement()).toBe('Fuel pump stopped when you left the view.');
  });

  it('stops and says why when the ECU stops answering', async () => {
    const { transport, ecu } = await connectedEcu();
    setup();

    render(<Harness ecu={ecu} />);
    await confirm('Run pump (continuous)', 'Run the fuel pump continuously?');
    await advance(10);
    transport.silent = true;
    await advance(1500);
    await advance(10_000);

    expect(running()).toBe('none');
    expect(screen.getByRole('alert')).toHaveTextContent(
      /^The fuel pump test stopped and may have partly run\. The ECU stopped responding\./,
    );
  });
});

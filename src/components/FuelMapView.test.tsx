// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryOffset, SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { buildSyntheticRom } from '../demo/syntheticRom';
import { expectNoAxeViolations, readingFor } from '../test-support/a11y';
import { connectedSession } from '../test-support/ecuSession';
import { SessionHarness } from '../test-support/WriteHarness';
import { FuelMapView } from './FuelMapView';

/**
 * Index bytes the ECU reports its position in the map with: the row or
 * column in the high nibble and the weighting towards the next, in 16ths, in
 * the low one. A row of 8 is past the last of the map's 8 rows: an invalid
 * position, which marks no cell.
 */
const INVALID_ROW = 0x80;

/**
 * The view on an ECU on the demo ROM (fuel map 5 in the newer layout) using
 * map 5, at the position in the map that `row` and `column` encode.
 */
async function renderOnMap5(row = INVALID_ROW, column = 0x00) {
  const transport = new SimulatedTransport();

  transport.loadRom(buildSyntheticRom());
  transport.memory[MemoryOffset.CurrentFuelMapId] = 5;
  transport.memory[MemoryOffset.FuelMapRowIndex] = row;
  transport.memory[MemoryOffset.FuelMapColumnIndex] = column;

  return renderView(transport);
}

async function renderView(transport: SimulatedTransport) {
  const { session } = await connectedSession(transport);

  return render(
    <SessionHarness session={session}>
      <FuelMapView />
    </SessionHarness>,
  );
}

describe('FuelMapView', () => {
  it('shows the map in use, its factors and its values by row and rpm', async () => {
    await renderOnMap5();

    expect(screen.getByText('Reading the fuel map…')).toBeInTheDocument();

    const table = await screen.findByRole('table');

    expect(readingFor('Map in use')).toHaveTextContent('5');
    expect(readingFor('Adjustment factor')).toHaveTextContent('0x5A00');
    expect(readingFor('Row scaler')).toHaveTextContent('0xB0');

    const headers = within(table).getAllByRole('columnheader');

    expect(headers.map((h) => h.textContent)).toEqual([
      'Row',
      '500 rpm',
      '600 rpm',
      '750 rpm',
      '800 rpm',
      '1000 rpm',
      '1200 rpm',
      '1500 rpm',
      '1875 rpm',
      '2000 rpm',
      '2400 rpm',
      '2500 rpm',
      '3000 rpm',
      '3750 rpm',
      '4000 rpm',
      '5000 rpm',
      '6000 rpm',
    ]);

    const rows = within(table).getAllByRole('row');

    expect(rows).toHaveLength(9);
    expect(
      within(rows[1] as HTMLElement)
        .getAllByRole('cell')
        .slice(0, 4)
        .map((cell) => cell.textContent),
    ).toEqual(['1C', '1E', '20', '22']);
    expect(
      within(rows[8] as HTMLElement).getByRole('rowheader'),
    ).toHaveTextContent('8');
    expect(
      screen.getByText('Waiting for the cell in use.'),
    ).toBeInTheDocument();
  });

  it('outlines the cell the ECU is using and says which it is', async () => {
    // Row 1 + 8/16 and column 6 + 12/16: the second row, seventh column.
    await renderOnMap5(0x18, 0x6c);

    const table = await screen.findByRole('table');
    const inUse = within(table).getByText(', in use now').closest('td');

    expect(inUse).toHaveTextContent('40, in use now');
    expect(inUse).toHaveAttribute('data-current');
    expect(
      screen.getByText('In use now: row 2, 1500 rpm column (outlined).'),
    ).toBeInTheDocument();
  });

  it('names the scrolling region after the table caption', async () => {
    await renderOnMap5();

    expect(
      await screen.findByRole('region', { name: /^Fuel map 5 values, in hex/ }),
    ).toHaveAttribute('tabindex', '0');
  });

  it('reports a failed read', async () => {
    const transport = new SimulatedTransport();

    transport.memory[MemoryOffset.CurrentFuelMapId] = 9;

    await renderView(transport);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('has no detectable accessibility violations', async () => {
    // Row 0 and column 4, weighted 0 towards the next.
    const { container } = await renderOnMap5(0x00, 0x40);

    await screen.findByRole('table');
    await expectNoAxeViolations(container);
  });

  it('explains the map in use and its factors on demand', async () => {
    const user = userEvent.setup();
    await renderOnMap5();
    await screen.findByRole('table');

    expect(
      screen.getByRole('button', { name: 'About Adjustment factor' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'About Row scaler' }));

    const info = screen.getByRole('dialog', { name: 'Row scaler' });

    expect(info).toHaveTextContent(/by engine load/);
    await expectNoAxeViolations(info);
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'About Map in use' }));

    expect(
      screen.getByRole('dialog', { name: 'Map in use' }),
    ).toHaveTextContent(/always use map 5/);
  });
});

// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, within } from '@testing-library/react';
import { Ecu, MemoryOffset, SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { buildSyntheticRom } from '../demo/syntheticRom';
import { expectNoAxeViolations, readingFor } from '../test-support/a11y';
import { snapshotAt } from '../test-support/snapshots';
import { FuelMapView } from './FuelMapView';

/** An ECU on the demo ROM (fuel map 5 in the newer layout) using map 5. */
async function ecuOnMap5() {
  const transport = new SimulatedTransport();

  transport.loadRom(buildSyntheticRom());
  transport.memory[MemoryOffset.CurrentFuelMapId] = 5;

  const ecu = new Ecu(transport);

  await ecu.connect();

  return { transport, ecu };
}

describe('FuelMapView', () => {
  it('shows the map in use, its factors and its values by row and rpm', async () => {
    const { ecu } = await ecuOnMap5();

    render(<FuelMapView ecu={ecu} snapshot={undefined} />);

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
    const { ecu } = await ecuOnMap5();

    render(
      <FuelMapView
        ecu={ecu}
        snapshot={snapshotAt(0, { fuelMapRow: 1.5, fuelMapColumn: 6.75 })}
      />,
    );

    const table = await screen.findByRole('table');
    const inUse = within(table).getByText(', in use now').closest('td');

    expect(inUse).toHaveTextContent('40, in use now');
    expect(inUse).toHaveAttribute('data-current');
    expect(
      screen.getByText('In use now: row 2, 1500 rpm column (outlined).'),
    ).toBeInTheDocument();
  });

  it('names the scrolling region after the table caption', async () => {
    const { ecu } = await ecuOnMap5();

    render(<FuelMapView ecu={ecu} snapshot={undefined} />);

    expect(
      await screen.findByRole('region', { name: /^Fuel map 5 values, in hex/ }),
    ).toHaveAttribute('tabindex', '0');
  });

  it('reports a failed read', async () => {
    const transport = new SimulatedTransport();

    transport.memory[MemoryOffset.CurrentFuelMapId] = 9;

    const ecu = new Ecu(transport);

    await ecu.connect();
    render(<FuelMapView ecu={ecu} snapshot={undefined} />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('has no detectable accessibility violations', async () => {
    const { ecu } = await ecuOnMap5();
    const { container } = render(
      <FuelMapView
        ecu={ecu}
        snapshot={snapshotAt(0, { fuelMapRow: 0, fuelMapColumn: 4 })}
      />,
    );

    await screen.findByRole('table');
    await expectNoAxeViolations(container);
  });
});

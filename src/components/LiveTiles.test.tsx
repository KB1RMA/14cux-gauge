// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen } from '@testing-library/react';
import { Gear } from '@kb1rma/libcomm14cux-ts';
import type { LiveSnapshot } from '../ecu/poller';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { expectNoAxeViolations, readingFor } from '../test-support/a11y';
import { LiveTiles } from './LiveTiles';

const SNAPSHOT: LiveSnapshot = {
  timestamp: 0,
  engineRpm: 750,
  roadSpeedMph: 62,
  throttle: 0.25,
  airflow: 0.1,
  lambdaShortOdd: 10,
  lambdaShortEven: -10,
  idleBypass: 0.5,
  gear: Gear.DriveOrReverse,
  milOn: true,
  fuelPumpOn: true,
  injectorPulseUs: 2350,
  fuelMapRow: 1.5,
  fuelMapColumn: 2.5,
  coolantTempF: 212,
  fuelTempF: 95,
  mainVoltage: null,
  lambdaLongOdd: 4,
  lambdaLongEven: -4,
  idleMode: true,
  targetIdleRpm: 740,
};

function renderTiles(snapshot: LiveSnapshot | undefined) {
  return render(
    <PreferencesProvider>
      <LiveTiles snapshot={snapshot} />
    </PreferencesProvider>,
  );
}

describe('LiveTiles', () => {
  it('shows each reading with its unit', () => {
    renderTiles(SNAPSHOT);

    expect(readingFor('Engine speed')).toHaveTextContent('750 rpm');
    expect(readingFor('Throttle')).toHaveTextContent('25 %');
    expect(readingFor('Airflow (MAF)')).toHaveTextContent('10.0 %');
    expect(readingFor('Short trim, odd')).toHaveTextContent('+10 counts');
    expect(readingFor('Short trim, even')).toHaveTextContent('-10 counts');
    expect(readingFor('Gear')).toHaveTextContent('D / R');
    expect(readingFor('MIL')).toHaveTextContent('On');
    expect(readingFor('Fuel pump relay')).toHaveTextContent('Running');
    expect(readingFor('Target idle')).toHaveTextContent('740 rpm');
    expect(readingFor('Injector pulse')).toHaveTextContent('2.35 ms');
    expect(readingFor('Fuel map row')).toHaveTextContent('2.5');
    expect(readingFor('Fuel map column')).toHaveTextContent('3.5');
    expect(readingFor('Idle control')).toHaveTextContent('Active');
  });

  it('groups readings under headings', () => {
    renderTiles(SNAPSHOT);

    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual([
      'Engine',
      'Airflow and throttle',
      'Electrics and fuelling',
      'Fuel map position',
      'States',
    ]);
    expect(screen.getByRole('region', { name: 'Engine' })).toBeInTheDocument();
  });

  it('shows only the readings asked for, without empty groups', () => {
    render(
      <PreferencesProvider>
        <LiveTiles snapshot={SNAPSHOT} keys={['coolantTempF', 'milOn']} />
      </PreferencesProvider>,
    );

    expect(screen.getAllByRole('term').map((dt) => dt.textContent)).toEqual([
      'Coolant',
      'MIL',
    ]);
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(['Engine', 'States']);
  });

  it('shows a dash for an invalid reading, and says so to screen readers', () => {
    renderTiles(SNAPSHOT);

    const voltage = readingFor('Main voltage');

    expect(voltage).toHaveTextContent('—No valid reading');
    expect(voltage.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      '—',
    );
  });

  it('says it is waiting before the first snapshot arrives', () => {
    renderTiles(undefined);

    expect(readingFor('Engine speed')).toHaveTextContent('Waiting for data');
  });

  it('shows temperatures and speed in the stored units', () => {
    localStorage.setItem(
      'cuxGauge.preferences',
      JSON.stringify({ temperatureUnit: 'C', speedUnit: 'kmh' }),
    );

    renderTiles(SNAPSHOT);

    expect(readingFor('Coolant')).toHaveTextContent('100 °C');
    expect(readingFor('Fuel temp')).toHaveTextContent('35 °C');
    expect(readingFor('Road speed')).toHaveTextContent('100 km/h');
  });

  it('falls back to the default units when storage is unavailable', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });

    renderTiles(SNAPSHOT);

    expect(readingFor('Coolant')).toHaveTextContent('212 °F');
    expect(readingFor('Road speed')).toHaveTextContent('62 mph');
    getItem.mockRestore();
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = renderTiles(SNAPSHOT);

    await expectNoAxeViolations(container);
  });
});

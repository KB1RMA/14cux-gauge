// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen } from '@testing-library/react';
import type { LiveStatus } from '../ecu/liveStatus';
import type { LiveSnapshot } from '../model/snapshot';
import { browserPlatform } from '../platform/browser';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { expectNoAxeViolations, readingFor } from '../test-support/a11y';
import { TestPlatform } from '../test-support/TestApp';
import { SnapshotDash } from './DashView';

const SNAPSHOT: LiveSnapshot = {
  timestamp: 0,
  engineRpm: 750,
  roadSpeedMph: 62,
  coolantTempF: 212,
  mainVoltage: 13.8,
  milOn: true,
};

const KEYS = [
  'engineRpm',
  'roadSpeedMph',
  'coolantTempF',
  'mainVoltage',
  'milOn',
] as const;

const LIVE: LiveStatus = { live: true };

function renderDash(snapshot: LiveSnapshot | undefined, status = LIVE) {
  return render(
    <TestPlatform platform={browserPlatform()}>
      <PreferencesProvider>
        <SnapshotDash keys={KEYS} snapshot={snapshot} status={status} />
      </PreferencesProvider>
    </TestPlatform>,
  );
}

describe('SnapshotDash', () => {
  it('shows each reading large, with its unit', async () => {
    const { container } = renderDash(SNAPSHOT);

    expect(readingFor('Engine speed')).toHaveTextContent(/^750 rpm$/);
    expect(readingFor('Road speed')).toHaveTextContent(/^62 mph$/);
    expect(readingFor('Coolant')).toHaveTextContent(/^212 °F$/);
    expect(readingFor('Main voltage')).toHaveTextContent(/^13\.8 V$/);
    expect(readingFor('MIL')).toHaveTextContent(/^On$/);
    await expectNoAxeViolations(container);
  });

  it('shows temperatures and speed in the stored units', () => {
    localStorage.setItem(
      'cuxGauge.preferences',
      JSON.stringify({ temperatureUnit: 'C', speedUnit: 'kmh' }),
    );

    renderDash(SNAPSHOT);

    expect(readingFor('Coolant')).toHaveTextContent(/^100 °C$/);
    expect(readingFor('Road speed')).toHaveTextContent(/^100 km\/h$/);
  });

  it('keeps an invalid reading apart from a reading not yet taken', () => {
    renderDash({ ...SNAPSHOT, mainVoltage: null });

    expect(readingFor('Main voltage')).toHaveTextContent(/^—No valid reading$/);

    renderDash(undefined);

    expect(screen.getAllByText('Waiting for data')).toHaveLength(KEYS.length);
  });

  it('replaces every value with “Stale” when readings are not live', async () => {
    const { container } = renderDash(SNAPSHOT, {
      live: false,
      reason: 'Not connected to an ECU.',
    });

    for (const label of [
      'Engine speed',
      'Road speed',
      'Coolant',
      'Main voltage',
      'MIL',
    ]) {
      expect(readingFor(label)).toHaveTextContent(/^—Stale$/);
    }

    expect(screen.queryByText(/750/)).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});

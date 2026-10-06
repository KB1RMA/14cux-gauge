// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Gear } from '@kb1rma/libcomm14cux-ts';
import {
  formatSample,
  injectorDuty,
  METRIC_GROUPS,
  METRICS,
  metricsInGroup,
  readingsFor,
  recordedKeys,
  sampleOf,
  type DisplayUnits,
  type MetricKey,
} from './metrics';
import type { LiveSnapshot } from './ecu/poller';
import { snapshotAt } from './test-support/snapshots';

const IMPERIAL: DisplayUnits = { temperatureUnit: 'F', speedUnit: 'mph' };
const METRIC: DisplayUnits = { temperatureUnit: 'C', speedUnit: 'kmh' };

function metric(key: MetricKey) {
  const found = METRICS.find((m) => m.key === key);

  if (!found) {
    throw new Error(`No metric ${key}`);
  }

  return found;
}

describe('metrics', () => {
  it('describes every snapshot reading exactly once, in group order', () => {
    const snapshotKeys = Object.keys(snapshotAt(0)).filter(
      (key) => key !== 'timestamp',
    );

    expect(
      METRICS.filter((m) => !m.derived)
        .map((m) => m.key)
        .sort(),
    ).toEqual(snapshotKeys.sort());
    expect(
      METRIC_GROUPS.flatMap((g) => metricsInGroup(g.id)).map((m) => m.key),
    ).toEqual(METRICS.map((m) => m.key));
  });

  it('turns snapshot readings into numeric samples', () => {
    const snapshot = snapshotAt(0, { milOn: true, fuelPumpOn: false });

    expect(sampleOf(snapshot, 'engineRpm')).toBe(750);
    expect(sampleOf(snapshot, 'milOn')).toBe(1);
    expect(sampleOf(snapshot, 'fuelPumpOn')).toBe(0);
    expect(sampleOf(snapshot, 'gear')).toBe(Gear.ParkOrNeutral);
    expect(
      sampleOf(snapshotAt(0, { mainVoltage: null }), 'mainVoltage'),
    ).toBeNull();
  });

  it('lists the metrics a recording has values for', () => {
    expect(
      recordedKeys([
        { timestamp: 0, coolantTempF: 190, milOn: false },
        { timestamp: 1, engineRpm: null, milOn: false },
      ]),
    ).toEqual(['engineRpm', 'coolantTempF', 'milOn']);
  });

  it('treats a metric missing from an older recording as no reading', () => {
    const { injectorPulseUs: _dropped, ...older } = snapshotAt(0);

    expect(sampleOf(older as LiveSnapshot, 'injectorPulseUs')).toBeNull();
  });

  it('shows fuel map positions from 1 and pulse widths in milliseconds', () => {
    expect(formatSample(metric('fuelMapRow'), 0, IMPERIAL)).toBe('1.0');
    expect(formatSample(metric('fuelMapColumn'), 6.75, IMPERIAL)).toBe('7.8');
    expect(formatSample(metric('injectorPulseUs'), 2350, IMPERIAL)).toBe(
      '2.35',
    );
    expect(formatSample(metric('idleMode'), 1, IMPERIAL)).toBe('Active');
    expect(formatSample(metric('idleMode'), 0, IMPERIAL)).toBe('Off');
  });

  it('works out injector duty: each bank fires once per revolution', () => {
    // 2.35 ms every 80 ms (one revolution at 750 rpm).
    expect(injectorDuty(2350, 750)).toBe(0.029375);
    // 10 ms every 10 ms (6000 rpm): open all the time.
    expect(injectorDuty(10000, 6000)).toBe(1);
    expect(injectorDuty(5000, 3000)).toBe(0.25);
    // Stopped: no injections.
    expect(injectorDuty(2350, 0)).toBe(0);
  });

  it('derives injector duty from the pulse and engine speed in a snapshot', () => {
    const duty = (snapshot: Partial<LiveSnapshot>) =>
      sampleOf({ timestamp: 0, ...snapshot }, 'injectorDuty');

    expect(duty({ injectorPulseUs: 2350, engineRpm: 750 })).toBe(0.029375);
    expect(duty({ injectorPulseUs: 12000, engineRpm: 6000 })).toBe(1.2);
    // Invalid or not taken if either reading is.
    expect(duty({ injectorPulseUs: null, engineRpm: 750 })).toBeNull();
    expect(duty({ injectorPulseUs: 2350, engineRpm: null })).toBeNull();
    expect(duty({ injectorPulseUs: 2350 })).toBeNull();
    expect(duty({ engineRpm: 750 })).toBeNull();
  });

  it('formats injector duty as a percentage, and says when it is high', () => {
    const duty = metric('injectorDuty');
    const show = (sample: number) => ({
      text: formatSample(duty, sample, IMPERIAL),
      tone: duty.tone?.(sample),
      note: duty.note?.(sample),
    });

    expect(duty.unit(IMPERIAL)).toBe('%');
    expect(show(0)).toEqual({ text: '0.0', tone: 'normal', note: undefined });
    expect(show(0.029375)).toEqual({
      text: '2.9',
      tone: 'normal',
      note: undefined,
    });
    expect(show(0.85)).toEqual({
      text: '85.0',
      tone: 'normal',
      note: undefined,
    });
    expect(show(0.851)).toEqual({
      text: '85.1',
      tone: 'warn',
      note: 'near limit',
    });
    // Rounds to 100.0 for display, but the threshold uses the sample.
    expect(show(0.9996)).toEqual({
      text: '100.0',
      tone: 'warn',
      note: 'near limit',
    });
    expect(show(1)).toEqual({
      text: '100.0',
      tone: 'alert',
      note: 'maxed out',
    });
    expect(show(1.2)).toEqual({
      text: '120.0',
      tone: 'alert',
      note: 'maxed out',
    });
  });

  it('takes the readings a derived metric needs', () => {
    expect([...readingsFor(['coolantTempF', 'injectorDuty'])]).toEqual([
      'coolantTempF',
      'injectorPulseUs',
      'engineRpm',
    ]);
  });

  it('lists injector duty for a recording with both of its readings', () => {
    expect(
      recordedKeys([{ timestamp: 0, engineRpm: 750, injectorPulseUs: null }]),
    ).toEqual(['engineRpm', 'injectorPulseUs', 'injectorDuty']);
    expect(recordedKeys([{ timestamp: 0, engineRpm: 750 }])).toEqual([
      'engineRpm',
    ]);
  });

  it('converts temperatures and speeds to the chosen units', () => {
    expect(formatSample(metric('coolantTempF'), 212, IMPERIAL)).toBe('212');
    expect(formatSample(metric('coolantTempF'), 212, METRIC)).toBe('100');
    expect(formatSample(metric('fuelTempF'), -13, METRIC)).toBe('-25');
    expect(formatSample(metric('fuelTempF'), 31.5, METRIC)).toBe('0');
    expect(formatSample(metric('roadSpeedMph'), 62, IMPERIAL)).toBe('62');
    expect(formatSample(metric('roadSpeedMph'), 62, METRIC)).toBe('100');
    expect(metric('coolantTempF').unit(METRIC)).toBe('°C');
    expect(metric('roadSpeedMph').unit(METRIC)).toBe('km/h');
  });

  it('formats fractions as percentages, and trims, volts and states', () => {
    expect(formatSample(metric('throttle'), 0.5005, IMPERIAL)).toBe('50');
    expect(formatSample(metric('airflow'), 0.1, IMPERIAL)).toBe('10.0');
    expect(metric('throttle').toDisplay(0.25, IMPERIAL)).toBe(25);
    expect(formatSample(metric('lambdaShortOdd'), 10, IMPERIAL)).toBe('+10');
    expect(formatSample(metric('mainVoltage'), 14.06, IMPERIAL)).toBe('14.1');
    expect(formatSample(metric('gear'), Gear.DriveOrReverse, IMPERIAL)).toBe(
      'D / R',
    );
    expect(formatSample(metric('milOn'), 1, IMPERIAL)).toBe('On');
    expect(formatSample(metric('fuelPumpOn'), 1, IMPERIAL)).toBe('Running');
    expect(formatSample(metric('fuelPumpOn'), 0, IMPERIAL)).toBe('Off');
  });

  it('marks the MIL and fuel pump by tone as well as text', () => {
    expect(metric('milOn').tone?.(1)).toBe('warn');
    expect(metric('milOn').tone?.(0)).toBe('normal');
    expect(metric('fuelPumpOn').tone?.(1)).toBe('good');
    expect(metric('engineRpm').tone).toBeUndefined();
  });

  it('explains every reading', () => {
    expect(
      METRICS.filter((m) => !/^[A-Z].{20,}\.$/.test(m.description)).map(
        (m) => m.key,
      ),
    ).toEqual([]);
  });

  it('gives typical values in the chosen units', () => {
    expect(metric('coolantTempF').typical?.(IMPERIAL)).toBe(
      'About 176–203 °F once warm.',
    );
    expect(metric('coolantTempF').typical?.(METRIC)).toBe(
      'About 80–95 °C once warm.',
    );
    expect(metric('lambdaLongEven').typical?.(METRIC)).toBe('Near 0.');
    expect(metric('lambdaLongEven').description).toContain(
      'cylinders 2, 4, 6 and 8',
    );
    expect(metric('lambdaShortOdd').description).toContain(
      'cylinders 1, 3, 5 and 7',
    );
    expect(metric('gear').typical).toBeUndefined();
  });

  it('plots on/off and gear readings as steps on a fixed axis', () => {
    expect(metric('milOn').chart).toEqual({ step: true, range: [0, 1] });
    expect(metric('gear').chart).toEqual({ step: true, range: [0, 3] });
    expect(metric('throttle').chart).toEqual({ range: [0, 100] });
    // Positions shown from 1 can reach just under one past the table size.
    expect(metric('fuelMapRow').chart).toEqual({ range: [1, 9] });
    expect(metric('fuelMapColumn').chart).toEqual({ range: [1, 17] });
    expect(metric('engineRpm').chart).toEqual({});
  });
});

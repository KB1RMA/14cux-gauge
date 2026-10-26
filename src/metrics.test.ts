// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Gear } from '@kb1rma/libcomm14cux-ts';
import {
  describeLimits,
  formatSample,
  injectorDuty,
  METRIC_GROUPS,
  METRICS,
  RPM_LIMIT,
  meterSpan,
  metricsInGroup,
  readingState,
  readingsFor,
  recordedKeys,
  sampleOf,
  type DisplayUnits,
  type Metric,
  type MetricKey,
} from './metrics';
import type { LiveSnapshot } from './model/snapshot';
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

  it('formats injector duty as a percentage, and says when it reaches its suggested limits', () => {
    const duty = metric('injectorDuty');
    const show = (sample: number) => ({
      text: formatSample(duty, sample, IMPERIAL),
      ...readingState(duty, duty.limits?.suggested, sample),
    });

    expect(duty.unit(IMPERIAL)).toBe('%');
    expect(show(0)).toEqual({ text: '0.0', tone: 'normal' });
    expect(show(0.029375)).toEqual({ text: '2.9', tone: 'normal' });
    expect(show(0.849)).toEqual({ text: '84.9', tone: 'normal' });
    // A high limit applies at its value.
    expect(show(0.85)).toEqual({
      text: '85.0',
      tone: 'warn',
      note: 'near limit',
    });
    expect(show(0.851)).toEqual({
      text: '85.1',
      tone: 'warn',
      note: 'near limit',
    });
    // Rounds to 100.0 for display, but the limit is compared with the sample.
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

  it('shows the rev limit in whole rpm, as engine speed is', () => {
    expect(RPM_LIMIT.unit).toBe('rpm');
    expect(RPM_LIMIT.format(5000)).toBe('5000');
    expect(RPM_LIMIT.format(4999.5)).toBe('5000');
    expect(RPM_LIMIT.format(4999.49)).toBe('4999');
    expect(RPM_LIMIT.format(0)).toBe('0');
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

  it("formats CO trim volts at the ECU's 5 mV resolution", () => {
    const co = metric('coTrimVoltage');

    expect(formatSample(co, 0, IMPERIAL)).toBe('0.000');
    expect(formatSample(co, 2.5, IMPERIAL)).toBe('2.500');
    expect(formatSample(co, 1.2402, IMPERIAL)).toBe('1.240');
    expect(formatSample(co, 4.9951, IMPERIAL)).toBe('4.995');
    expect(co.unit(IMPERIAL)).toBe('V');
    expect(co.chart).toEqual({ range: [0, 5] });
  });

  it('names purge valve, A/C and heated screen states in text', () => {
    const purge = metric('purgeValve');

    expect(formatSample(purge, 0, IMPERIAL)).toBe('Closed');
    expect(formatSample(purge, 1, IMPERIAL)).toBe('Toggling');
    expect(formatSample(purge, 2, IMPERIAL)).toBe('Open');
    expect(formatSample(purge, 3, IMPERIAL)).toBe('No reading');
    expect(purge.chart).toEqual({ step: true, range: [0, 2] });
    expect(formatSample(metric('acCompressorOn'), 1, IMPERIAL)).toBe('On');
    expect(formatSample(metric('acCompressorOn'), 0, IMPERIAL)).toBe('Off');
    expect(formatSample(metric('screenHeaterOn'), 1, IMPERIAL)).toBe('On');
    expect(formatSample(metric('screenHeaterOn'), 0, IMPERIAL)).toBe('Off');
  });

  it('keeps the new readings as library-unit samples', () => {
    const snapshot = snapshotAt(0, {
      coTrimVoltage: 1.2402,
      purgeValve: 2,
      acCompressorOn: true,
      screenHeaterOn: false,
    });

    expect(sampleOf(snapshot, 'coTrimVoltage')).toBe(1.2402);
    expect(sampleOf(snapshot, 'purgeValve')).toBe(2);
    expect(sampleOf(snapshot, 'acCompressorOn')).toBe(1);
    expect(sampleOf(snapshot, 'screenHeaterOn')).toBe(0);
  });

  it('marks the MIL and fuel pump by tone as well as text', () => {
    expect(metric('milOn').tone?.(1)).toBe('warn');
    expect(metric('milOn').tone?.(0)).toBe('normal');
    expect(metric('fuelPumpOn').tone?.(1)).toBe('good');
    expect(metric('engineRpm').tone).toBeUndefined();
  });

  it('says in words when coolant reaches its suggested limits', () => {
    const coolant = metric('coolantTempF');
    const state = (sample: number) =>
      readingState(coolant, coolant.limits?.suggested, sample);

    expect(coolant.limits?.suggested).toEqual({
      highWarn: 221,
      highAlert: 239,
    });
    expect(state(220.9)).toEqual({ tone: 'normal' });
    // 221 °F is 105 °C.
    expect(state(221)).toEqual({ tone: 'warn', note: 'hot' });
    expect(state(238.9)).toEqual({ tone: 'warn', note: 'hot' });
    // 239 °F is 115 °C.
    expect(state(239)).toEqual({ tone: 'alert', note: 'overheating' });
    expect(state(300)).toEqual({ tone: 'alert', note: 'overheating' });
    // Cold is not flagged: the ECU enriches for it.
    expect(state(-13)).toEqual({ tone: 'normal' });
    // Limits change the colour and note, never the reading.
    expect(formatSample(coolant, 230, IMPERIAL)).toBe('230');
    expect(formatSample(coolant, 230, METRIC)).toBe('110');
  });

  it('compares the full-precision sample with a limit, not the rounded value', () => {
    const coolant = metric('coolantTempF');
    const limits = { highWarn: 221 };

    // Shows as 221 °F and 105 °C, but is below the limit.
    expect(formatSample(coolant, 220.6, IMPERIAL)).toBe('221');
    expect(formatSample(coolant, 220.6, METRIC)).toBe('105');
    expect(readingState(coolant, limits, 220.6)).toEqual({ tone: 'normal' });
  });

  it('says in words when a reading is at, below or above its limits', () => {
    const voltage = metric('mainVoltage');
    const limits = {
      lowAlert: 11,
      lowWarn: 12,
      highWarn: 14.8,
      highAlert: 15.5,
    };
    const state = (sample: number) => readingState(voltage, limits, sample);

    expect(state(10.9)).toEqual({ tone: 'alert', note: 'very low' });
    expect(state(11)).toEqual({ tone: 'alert', note: 'very low' });
    expect(state(11.01)).toEqual({ tone: 'warn', note: 'low' });
    expect(state(12)).toEqual({ tone: 'warn', note: 'low' });
    expect(state(12.01)).toEqual({ tone: 'normal' });
    expect(state(14.79)).toEqual({ tone: 'normal' });
    expect(state(14.8)).toEqual({ tone: 'warn', note: 'high' });
    expect(state(15.49)).toEqual({ tone: 'warn', note: 'high' });
    expect(state(15.5)).toEqual({ tone: 'alert', note: 'very high' });
    expect(state(0)).toEqual({ tone: 'alert', note: 'very low' });
    expect(state(-1)).toEqual({ tone: 'alert', note: 'very low' });
  });

  it('flags nothing with no limits, as in replay', () => {
    expect(readingState(metric('coolantTempF'), undefined, 300)).toEqual({
      tone: 'normal',
    });
    expect(readingState(metric('mainVoltage'), {}, 0)).toEqual({
      tone: 'normal',
    });
    // On/off readings keep their own tone, with no note.
    expect(readingState(metric('milOn'), undefined, 1)).toEqual({
      tone: 'warn',
    });
  });

  it('offers limits on every continuous reading, and not on states or map positions', () => {
    expect(
      METRICS.filter((m) => m.limits !== undefined).map((m) => m.key),
    ).toEqual([
      'engineRpm',
      'targetIdleRpm',
      'roadSpeedMph',
      'coolantTempF',
      'fuelTempF',
      'throttle',
      'airflow',
      'idleBypass',
      'mainVoltage',
      'injectorPulseUs',
      'injectorDuty',
      'coTrimVoltage',
      'lambdaShortOdd',
      'lambdaShortEven',
      'lambdaLongOdd',
      'lambdaLongEven',
    ]);
  });

  it('suggests limits only where owners report a general guide', () => {
    expect(
      Object.fromEntries(
        METRICS.flatMap((m) =>
          m.limits && Object.keys(m.limits.suggested).length > 0
            ? [[m.key, m.limits.suggested]]
            : [],
        ),
      ),
    ).toEqual({
      engineRpm: { highWarn: 5000, highAlert: 5500 },
      coolantTempF: { highWarn: 221, highAlert: 239 },
      fuelTempF: { highWarn: 158 },
      mainVoltage: {
        lowAlert: 11,
        lowWarn: 12,
        highWarn: 14.8,
        highAlert: 15.5,
      },
      injectorDuty: { highWarn: 0.85, highAlert: 1 },
    });
  });

  it('says where each suggestion comes from, in the user’s units', () => {
    const basis = (m: Metric, units: DisplayUnits) => m.limits?.basis?.(units);

    expect(basis(metric('coolantTempF'), METRIC)).toBe(
      'Coolant runs at about 80–95 °C once warm; the thermostat opens at 88 °C. ' +
        '105 °C is hotter than a healthy cooling system runs, and by 115 °C ' +
        'coolant is close to boiling under a 15 psi cap.',
    );
    expect(basis(metric('coolantTempF'), IMPERIAL)).toBe(
      'Coolant runs at about 176–203 °F once warm; the thermostat opens at 190 °F. ' +
        '221 °F is hotter than a healthy cooling system runs, and by 239 °F ' +
        'coolant is close to boiling under a 15 psi cap.',
    );
    expect(basis(metric('fuelTempF'), METRIC)).toBe(
      'Owners report fuel rail readings of about 25–50 °C while driving. ' +
        'From about 70 °C fuel can start to vaporise in the rail, which the ' +
        'ECU’s hot-start enrichment exists to clear.',
    );
    const suggesting = METRICS.filter(
      (m) => m.limits && Object.keys(m.limits.suggested).length > 0,
    );

    expect(
      suggesting.filter(
        (m) => !/^[A-Z].{40,}\.$/.test(m.limits?.basis?.(IMPERIAL) ?? ''),
      ),
    ).toEqual([]);
  });

  it('turns a typed limit back into a sample in library units', () => {
    const back = (key: MetricKey, display: number, units: DisplayUnits) =>
      metric(key).limits?.fromDisplay(display, units);

    expect(back('coolantTempF', 105, METRIC)).toBe(221);
    expect(back('coolantTempF', -40, METRIC)).toBe(-40);
    expect(back('coolantTempF', 0, METRIC)).toBe(32);
    expect(back('coolantTempF', 221, IMPERIAL)).toBe(221);
    expect(back('roadSpeedMph', 100, IMPERIAL)).toBe(100);
    expect(back('roadSpeedMph', 160.9344, METRIC)).toBe(100);
    expect(back('throttle', 85, IMPERIAL)).toBe(0.85);
    expect(back('injectorDuty', 85, IMPERIAL)).toBe(0.85);
    expect(back('injectorPulseUs', 2.35, IMPERIAL)).toBe(2350);
    expect(back('mainVoltage', 12, METRIC)).toBe(12);
    expect(back('lambdaLongOdd', -100, IMPERIAL)).toBe(-100);
  });

  it('describes limits in the user’s units, lowest first', () => {
    const voltage = metric('mainVoltage');
    const coolant = metric('coolantTempF');

    expect(
      describeLimits(
        voltage,
        { highAlert: 15.5, lowWarn: 12, lowAlert: 11, highWarn: 14.8 },
        IMPERIAL,
      ),
    ).toEqual([
      'very low ≤ 11.0 V',
      'low ≤ 12.0 V',
      'high ≥ 14.8 V',
      'very high ≥ 15.5 V',
    ]);
    expect(
      describeLimits(coolant, { highWarn: 221, highAlert: 239 }, IMPERIAL),
    ).toEqual(['hot ≥ 221 °F', 'overheating ≥ 239 °F']);
    expect(
      describeLimits(coolant, { highWarn: 221, highAlert: 239 }, METRIC),
    ).toEqual(['hot ≥ 105 °C', 'overheating ≥ 115 °C']);
    expect(
      describeLimits(metric('lambdaLongOdd'), { lowWarn: -100 }, METRIC),
    ).toEqual(['low ≤ -100 counts']);
    expect(describeLimits(coolant, {}, METRIC)).toEqual([]);
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

  it('draws fuel trims as centred meters and idle bypass as a filling one', () => {
    const centred = { range: [-256, 255], centred: true } as const;

    for (const key of [
      'lambdaShortOdd',
      'lambdaShortEven',
      'lambdaLongOdd',
      'lambdaLongEven',
    ] as const) {
      expect(metric(key).meter).toEqual(centred);
    }

    expect(metric('idleBypass').meter).toEqual({ range: [0, 100] });
    expect(metric('engineRpm').meter).toBeUndefined();
  });

  it('spans a centred meter from the zero line to the value', () => {
    const centred = { range: [-256, 255], centred: true } as const;

    expect(meterSpan(centred, 0)).toEqual([0.5, 0.5]);
    expect(meterSpan(centred, 255)).toEqual([0.5, 1]);
    expect(meterSpan(centred, -256)).toEqual([0, 0.5]);
    expect(meterSpan(centred, -128)).toEqual([0.25, 0.5]);
    expect(meterSpan(centred, 51)).toEqual([0.5, 0.6]);
    // Past the range, the bar stops at the edge.
    expect(meterSpan(centred, 300)).toEqual([0.5, 1]);
    expect(meterSpan(centred, -300)).toEqual([0, 0.5]);
  });

  it('fills a plain meter from the low end', () => {
    const plain = { range: [0, 100] } as const;

    expect(meterSpan(plain, 0)).toEqual([0, 0]);
    expect(meterSpan(plain, 25)).toEqual([0, 0.25]);
    expect(meterSpan(plain, 100)).toEqual([0, 1]);
    expect(meterSpan(plain, 120)).toEqual([0, 1]);
    expect(meterSpan(plain, -5)).toEqual([0, 0]);
  });
});

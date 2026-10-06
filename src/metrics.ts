// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Gear } from '@kb1rma/libcomm14cux-ts';
import type { LiveSnapshot, ReadingKey } from './ecu/poller';
import {
  fahrenheitToCelsius,
  formatGear,
  formatSigned,
  mphToKmh,
  speedLabel,
  temperatureLabel,
  type SpeedUnit,
  type TemperatureUnit,
} from './units';

/**
 * Every live reading the dashboard shows, described once so the tiles, the
 * graphs and recorded sessions agree on labels, units and formatting.
 *
 * A metric's *sample* is a plain number in the library's units (°F, mph, a
 * 0–1 fraction, 1/0 for on/off), or `null` for an invalid reading. Samples
 * are what the history and recordings keep, so they never depend on the
 * user's display units. `toDisplay` converts a sample for showing.
 */

/** Metrics the app works out from readings, rather than reads. */
export type DerivedKey = 'injectorDuty';

export type MetricKey = ReadingKey | DerivedKey;

export interface DisplayUnits {
  temperatureUnit: TemperatureUnit;
  speedUnit: SpeedUnit;
}

export type MetricGroup = 'engine' | 'air' | 'fuelling' | 'fuelMap' | 'states';

export type MetricTone = 'normal' | 'good' | 'warn' | 'alert';

export interface Metric {
  key: MetricKey;
  label: string;
  group: MetricGroup;
  /** Unit shown after the value, if any. */
  unit(units: DisplayUnits): string | undefined;
  /** Converts a sample to the number shown (and plotted). */
  toDisplay(sample: number, units: DisplayUnits): number;
  /** Formats a display value as text. */
  format(display: number): string;
  /** What the reading is, in a sentence or two of plain language. */
  description: string;
  /**
   * What the reading usually looks like on a healthy engine, if that can be
   * said simply. A guide only; engines, tunes and conditions vary.
   */
  typical?(units: DisplayUnits): string;
  /** Colour emphasis for a sample; `note` must carry the meaning in text. */
  tone?(sample: number): MetricTone;
  /** A word or two shown beside a value that needs attention. */
  note?(sample: number): string | undefined;
  /**
   * For a metric worked out by the app: the readings it needs, all from the
   * same snapshot, and how to work out its sample from their samples.
   */
  derived?: {
    from: readonly ReadingKey[];
    sample(inputs: readonly number[]): number;
  };
  /**
   * How to plot it. `step` holds each value until the next (on/off and
   * enumerated readings). `range` fixes the y axis in display units;
   * without it the axis fits the data. `atLeast` shows at least that range
   * and grows to fit data outside it, for a value that can exceed its
   * usual bounds.
   */
  chart: {
    step?: boolean;
    range?: readonly [number, number];
    atLeast?: readonly [number, number];
  };
  /**
   * A bar drawn under the value, over a fixed `range` in display units. A
   * `centred` bar grows left or right from 0; otherwise it fills from the
   * low end. Only a picture of the value, which the text still carries.
   */
  meter?: { range: readonly [number, number]; centred?: boolean };
}

export const METRIC_GROUPS: readonly { id: MetricGroup; title: string }[] = [
  { id: 'engine', title: 'Engine' },
  { id: 'air', title: 'Airflow and throttle' },
  { id: 'fuelling', title: 'Electrics and fuelling' },
  { id: 'fuelMap', title: 'Fuel map position' },
  { id: 'states', title: 'States' },
];

const same = (sample: number) => sample;
const percent = (sample: number) => sample * 100;
// Math.round for whole numbers, so -0.4 shows as "0" rather than "-0".
const fixed = (decimals: number) => (display: number) =>
  decimals === 0 ? Math.round(display).toString() : display.toFixed(decimals);
const temperature = (sample: number, { temperatureUnit }: DisplayUnits) =>
  temperatureUnit === 'C' ? fahrenheitToCelsius(sample) : sample;
/**
 * Each injector bank fires once per crankshaft revolution while the engine
 * runs: the ECU's spark interrupt runs on every spark (four per revolution
 * on a V8) and fuels on every other one, alternating banks. See the
 * commented firmware disassembly, firmware/ignitionInt.asm, in
 * https://github.com/colinbourassa/14cux-firmware.
 */
const US_PER_REVOLUTION_AT_1_RPM = 60_000_000;

/**
 * Injector duty cycle as a fraction (1 = held open all the time): the pulse
 * width over the time between one bank's injections, one crank revolution.
 */
export function injectorDuty(pulseUs: number, rpm: number): number {
  return (pulseUs * rpm) / US_PER_REVOLUTION_AT_1_RPM;
}

const temperatureUnit = ({ temperatureUnit: unit }: DisplayUnits) =>
  temperatureLabel(unit);

/** A Fahrenheit range in the user's temperature unit, such as "80–95 °C". */
const temperatureRange = (
  lowF: number,
  highF: number,
  units: DisplayUnits,
): string => {
  const show = (f: number) => Math.round(temperature(f, units)).toString();

  return `${show(lowF)}–${show(highF)} ${temperatureUnit(units)}`;
};

const trim = (label: string): Omit<Metric, 'key' | 'description'> => ({
  label,
  group: 'fuelling',
  unit: () => 'counts',
  toDisplay: same,
  format: formatSigned,
  chart: {},
  // The library's full range of trim counts, centred on no correction.
  meter: { range: [-256, 255], centred: true },
});
const BANKS = {
  odd: 'odd-numbered bank (cylinders 1, 3, 5 and 7)',
  even: 'even-numbered bank (cylinders 2, 4, 6 and 8)',
} as const;
const shortTrim = (
  label: string,
  bank: keyof typeof BANKS,
): Omit<Metric, 'key'> => ({
  ...trim(label),
  description:
    `The quick fuelling correction the ECU makes for the ${BANKS[bank]} ` +
    'from that bank’s oxygen sensor. Positive adds fuel, negative takes it ' +
    'away. Tunes without oxygen sensors do not use it.',
  typical: () =>
    'Swings either side of 0 while the engine is warm and the ECU is ' +
    'correcting from the oxygen sensors.',
});
const longTrim = (
  label: string,
  bank: keyof typeof BANKS,
): Omit<Metric, 'key'> => ({
  ...trim(label),
  description:
    'The fuelling correction the ECU has learned over time for the ' +
    `${BANKS[bank]}, kept between drives. Positive adds fuel. A large value ` +
    'means the bank needs constant correction, for example from an air ' +
    'leak or a failing sensor.',
  typical: () => 'Near 0.',
});
// Positions are stored from 0, and shown from 1 to match the fuel map table.
const mapPosition = (
  label: string,
  size: number,
  description: string,
): Omit<Metric, 'key'> => ({
  label,
  description,
  group: 'fuelMap',
  unit: () => undefined,
  toDisplay: (sample) => sample + 1,
  format: fixed(1),
  // Positions run from 0 up to size - 1/16, so just under size + 1 once shown
  // from 1.
  chart: { range: [1, size + 1] },
});
const onOff = (
  label: string,
  on: string,
  tone: MetricTone,
  description: string,
): Omit<Metric, 'key'> => ({
  label,
  description,
  group: 'states',
  unit: () => undefined,
  toDisplay: same,
  format: (display) => (display ? on : 'Off'),
  tone: (sample) => (sample ? tone : 'normal'),
  chart: { step: true, range: [0, 1] },
});

/** Duty above which the injectors are close to their limit (85 %). */
const DUTY_NEAR_LIMIT = 0.85;

// A Record, so the compiler insists on a definition for every reading.
const DEFINITIONS: Record<MetricKey, Omit<Metric, 'key'>> = {
  engineRpm: {
    label: 'Engine speed',
    description:
      'Crankshaft speed, measured from the ignition. 0 with the ignition on and the engine stopped.',
    typical: () => 'Steady and close to the target idle speed at idle.',
    group: 'engine',
    unit: () => 'rpm',
    toDisplay: same,
    format: fixed(0),
    chart: {},
  },
  roadSpeedMph: {
    label: 'Road speed',
    description:
      'Vehicle speed from the road speed sensor, as the ECU sees it.',
    group: 'engine',
    unit: ({ speedUnit }) => speedLabel(speedUnit),
    toDisplay: (sample, { speedUnit }) =>
      speedUnit === 'kmh' ? mphToKmh(sample) : sample,
    format: fixed(0),
    chart: {},
  },
  targetIdleRpm: {
    label: 'Target idle',
    description:
      'The idle speed the ECU is aiming for. It is higher while the engine is cold, and the ECU opens or closes the idle bypass to reach it.',
    typical: () => 'Roughly 600–800 rpm when warm; higher when cold.',
    group: 'engine',
    unit: () => 'rpm',
    toDisplay: same,
    format: fixed(0),
    chart: {},
  },
  coolantTempF: {
    label: 'Coolant',
    description:
      'Engine coolant temperature from the ECU’s coolant sensor. The ECU adds fuel and raises the idle speed while the engine is cold, so a faulty sensor upsets fuelling.',
    typical: (units) => `About ${temperatureRange(176, 203, units)} once warm.`,
    group: 'engine',
    unit: temperatureUnit,
    toDisplay: temperature,
    format: fixed(0),
    chart: {},
  },
  fuelTempF: {
    label: 'Fuel temp',
    description:
      'Temperature of the fuel in the fuel rail. The ECU adds fuel when it is hot, to help a hot engine restart.',
    typical: () =>
      'Near the air temperature on a cold engine; rises as the engine bay heats up, and most after a hot engine is switched off.',
    group: 'engine',
    unit: temperatureUnit,
    toDisplay: temperature,
    format: fixed(0),
    chart: {},
  },
  throttle: {
    label: 'Throttle',
    description:
      'How far the throttle is open, from the throttle position sensor. Shown from the lowest position the ECU has seen, so a closed throttle reads 0 %.',
    typical: () =>
      'Near 0 % with your foot off the pedal; near 100 % at full throttle.',
    group: 'air',
    unit: () => '%',
    toDisplay: percent,
    format: fixed(0),
    chart: { range: [0, 100] },
  },
  airflow: {
    label: 'Airflow (MAF)',
    description:
      'How much air the engine is drawing in, from the hot-wire mass airflow sensor, as a percentage of the most it can measure. With engine speed, it decides how much fuel to inject.',
    typical: () => 'Low at idle; rises with engine speed and load.',
    group: 'air',
    unit: () => '%',
    toDisplay: percent,
    format: fixed(1),
    chart: { range: [0, 100] },
  },
  idleBypass: {
    label: 'Idle bypass',
    description:
      'How far the stepper motor has opened the air passage around the closed throttle. The ECU moves it to hold the target idle speed.',
    typical: () =>
      'A small opening at a warm idle; more when cold or with extra load such as lights or air conditioning.',
    group: 'air',
    unit: () => '% open',
    toDisplay: percent,
    format: fixed(0),
    chart: { range: [0, 100] },
    meter: { range: [0, 100] },
  },
  mainVoltage: {
    label: 'Main voltage',
    description:
      'Supply voltage reaching the ECU through the main relay. It should be close to battery voltage.',
    typical: () =>
      'About 13.5–14.5 V with the engine running and the alternator charging; about 12–12.8 V with it stopped.',
    group: 'fuelling',
    unit: () => 'V',
    toDisplay: same,
    format: fixed(1),
    chart: {},
  },
  injectorPulseUs: {
    label: 'Injector pulse',
    description:
      'How long each injector is held open each time it fires: longer means more fuel. The ECU keeps one value for both banks, so while it corrects each bank separately this may show either.',
    typical: () =>
      'A few milliseconds at a warm idle; longer under load and when cold.',
    group: 'fuelling',
    unit: () => 'ms',
    toDisplay: (sample) => sample / 1000,
    format: fixed(2),
    chart: {},
  },
  injectorDuty: {
    label: 'Injector duty',
    description:
      'Worked out by this app, not read from the ECU: how much of the time ' +
      'each injector is held open, from the injector pulse and engine speed. ' +
      'Each bank fires once per crankshaft revolution, so 100 % means the ' +
      'injectors never close and cannot deliver more fuel. It reads low ' +
      'while the engine is cranking, when the ECU fires twice as often, and ' +
      'high at the rev limit, when it skips injections.',
    typical: () =>
      'A few percent at a warm idle; rising with speed and load. Above ' +
      'about 85 % the injectors are near their limit.',
    group: 'fuelling',
    unit: () => '%',
    toDisplay: percent,
    // Pulse width has 1 µs and engine speed 1 rpm resolution, so the duty is
    // known far more finely than 0.1 %; 0.1 % shows its movement at idle.
    format: fixed(1),
    tone: (sample) =>
      sample >= 1 ? 'alert' : sample > DUTY_NEAR_LIMIT ? 'warn' : 'normal',
    note: (sample) =>
      sample >= 1
        ? 'maxed out'
        : sample > DUTY_NEAR_LIMIT
          ? 'near limit'
          : undefined,
    derived: {
      from: ['injectorPulseUs', 'engineRpm'],
      sample: ([pulseUs = 0, rpm = 0]) => injectorDuty(pulseUs, rpm),
    },
    // Can pass 100 % when the ECU asks for more fuel than one revolution
    // allows, so the axis grows rather than clips.
    chart: { atLeast: [0, 100] },
  },
  lambdaShortOdd: shortTrim('Short trim, odd', 'odd'),
  lambdaShortEven: shortTrim('Short trim, even', 'even'),
  lambdaLongOdd: longTrim('Long trim, odd', 'odd'),
  lambdaLongEven: longTrim('Long trim, even', 'even'),
  gear: {
    label: 'Gear',
    description:
      'Gear selector position, from the automatic gearbox’s switch: P / N or D / R. A manual gearbox does not report a gear.',
    group: 'states',
    unit: () => undefined,
    toDisplay: same,
    format: (display) => formatGear(display as Gear),
    chart: { step: true, range: [0, 3] },
  },
  fuelMapRow: mapPosition(
    'Fuel map row',
    8,
    'Where the engine is on the fuel map’s load axis, worked out from ' +
      'airflow: 1 is the lightest load, 8 the heaviest. The fraction is how ' +
      'far it is towards the next row; the ECU blends neighbouring cells.',
  ),
  fuelMapColumn: mapPosition(
    'Fuel map column',
    16,
    'Where the engine is on the fuel map’s engine speed axis: 1 is the ' +
      'slowest band, 16 the fastest. The fraction is how far it is towards ' +
      'the next column.',
  ),
  idleMode: onOff(
    'Idle control',
    'Active',
    'normal',
    'Whether the ECU is holding the engine at the target idle speed with ' +
      'the idle bypass. Usually active with the throttle closed and the ' +
      'engine near idle speed.',
  ),
  milOn: onOff(
    'MIL',
    'On',
    'warn',
    'The malfunction indicator (check engine) lamp. On means the ECU has ' +
      'stored a fault; see Fault codes. Not every fault lights it.',
  ),
  fuelPumpOn: onOff(
    'Fuel pump relay',
    'Running',
    'good',
    'Whether the ECU is running the fuel pump. It runs for a moment when ' +
      'the ignition is switched on, then only while the engine turns.',
  ),
};

/** Display order: by group, then as listed. */
const ORDER: readonly MetricKey[] = [
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
  'lambdaShortOdd',
  'lambdaShortEven',
  'lambdaLongOdd',
  'lambdaLongEven',
  'fuelMapRow',
  'fuelMapColumn',
  'idleMode',
  'gear',
  'milOn',
  'fuelPumpOn',
];

export const METRICS: readonly Metric[] = ORDER.map((key) => ({
  key,
  ...DEFINITIONS[key],
}));

export const METRIC_KEYS: readonly MetricKey[] = ORDER;

export function metricsInGroup(group: MetricGroup): readonly Metric[] {
  return METRICS.filter((metric) => metric.group === group);
}

/** A snapshot reading as a sample: booleans become 1/0. */
export function sampleOf(
  snapshot: LiveSnapshot,
  key: MetricKey,
): number | null {
  const { derived } = DEFINITIONS[key];

  if (derived) {
    const inputs = derived.from.map((input) => sampleOf(snapshot, input));

    // Missing or invalid if any input is.
    return inputs.every((input) => input !== null)
      ? derived.sample(inputs as number[])
      : null;
  }

  // A reading that was not taken (not chosen, or recorded before the metric
  // existed) has no value.
  const value = snapshot[key as ReadingKey];

  return typeof value === 'boolean' ? Number(value) : (value ?? null);
}

/**
 * The readings to take for `keys`: the readings themselves, and the
 * readings any derived metric among them is worked out from.
 */
export function readingsFor(keys: Iterable<MetricKey>): Set<ReadingKey> {
  const readings = new Set<ReadingKey>();

  for (const key of keys) {
    const { derived } = DEFINITIONS[key];

    for (const reading of derived ? derived.from : [key as ReadingKey]) {
      readings.add(reading);
    }
  }

  return readings;
}

/** The metrics any of `snapshots` has a value for, in display order. */
export function recordedKeys(snapshots: readonly LiveSnapshot[]): MetricKey[] {
  return METRIC_KEYS.filter((key) =>
    snapshots.some((snapshot) =>
      [...readingsFor([key])].every((input) => snapshot[input] !== undefined),
    ),
  );
}

/** Formats a sample for display, with the user's units. */
export function formatSample(
  metric: Metric,
  sample: number,
  units: DisplayUnits,
): string {
  return metric.format(metric.toDisplay(sample, units));
}

/**
 * Where a metric's meter bar starts and ends for a display value, as
 * fractions (0–1) of the meter's width. A centred bar runs between the zero
 * line and the value, scaled separately either side of zero so each end of
 * the range reaches its edge. A value outside the range stops at the edge;
 * the text beside it still shows the reading.
 */
export function meterSpan(
  meter: NonNullable<Metric['meter']>,
  display: number,
): readonly [number, number] {
  const [low, high] = meter.range;
  const edge = (fraction: number) => Math.min(Math.max(fraction, 0), 1);

  if (!meter.centred) {
    return [0, edge((display - low) / (high - low))];
  }

  const position =
    display < 0 ? 0.5 - (display / low) * 0.5 : 0.5 + (display / high) * 0.5;

  return display < 0 ? [edge(position), 0.5] : [0.5, edge(position)];
}

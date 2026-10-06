// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Gear } from '@kb1rma/libcomm14cux-ts';
import type { LiveSnapshot } from './ecu/poller';
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

export type MetricKey = Exclude<keyof LiveSnapshot, 'timestamp'>;

export interface DisplayUnits {
  temperatureUnit: TemperatureUnit;
  speedUnit: SpeedUnit;
}

export type MetricGroup = 'engine' | 'air' | 'fuelling' | 'fuelMap' | 'states';

export type MetricTone = 'normal' | 'good' | 'warn';

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
  /** Colour emphasis for a sample; the text must carry the meaning alone. */
  tone?(sample: number): MetricTone;
  /**
   * How to plot it. `step` holds each value until the next (on/off and
   * enumerated readings). `range` fixes the y axis in display units;
   * without it the axis fits the data.
   */
  chart: { step?: boolean; range?: readonly [number, number] };
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
const temperatureUnit = ({ temperatureUnit: unit }: DisplayUnits) =>
  temperatureLabel(unit);
const trim = (label: string): Omit<Metric, 'key'> => ({
  label,
  group: 'fuelling',
  unit: () => 'counts',
  toDisplay: same,
  format: formatSigned,
  chart: {},
});
// Positions are stored from 0, and shown from 1 to match the fuel map table.
const mapPosition = (label: string, size: number): Omit<Metric, 'key'> => ({
  label,
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
): Omit<Metric, 'key'> => ({
  label,
  group: 'states',
  unit: () => undefined,
  toDisplay: same,
  format: (display) => (display ? on : 'Off'),
  tone: (sample) => (sample ? tone : 'normal'),
  chart: { step: true, range: [0, 1] },
});

// A Record, so the compiler insists on a definition for every reading.
const DEFINITIONS: Record<MetricKey, Omit<Metric, 'key'>> = {
  engineRpm: {
    label: 'Engine speed',
    group: 'engine',
    unit: () => 'rpm',
    toDisplay: same,
    format: fixed(0),
    chart: {},
  },
  roadSpeedMph: {
    label: 'Road speed',
    group: 'engine',
    unit: ({ speedUnit }) => speedLabel(speedUnit),
    toDisplay: (sample, { speedUnit }) =>
      speedUnit === 'kmh' ? mphToKmh(sample) : sample,
    format: fixed(0),
    chart: {},
  },
  targetIdleRpm: {
    label: 'Target idle',
    group: 'engine',
    unit: () => 'rpm',
    toDisplay: same,
    format: fixed(0),
    chart: {},
  },
  coolantTempF: {
    label: 'Coolant',
    group: 'engine',
    unit: temperatureUnit,
    toDisplay: temperature,
    format: fixed(0),
    chart: {},
  },
  fuelTempF: {
    label: 'Fuel temp',
    group: 'engine',
    unit: temperatureUnit,
    toDisplay: temperature,
    format: fixed(0),
    chart: {},
  },
  throttle: {
    label: 'Throttle',
    group: 'air',
    unit: () => '%',
    toDisplay: percent,
    format: fixed(0),
    chart: { range: [0, 100] },
  },
  airflow: {
    label: 'Airflow (MAF)',
    group: 'air',
    unit: () => '%',
    toDisplay: percent,
    format: fixed(1),
    chart: { range: [0, 100] },
  },
  idleBypass: {
    label: 'Idle bypass',
    group: 'air',
    unit: () => '% open',
    toDisplay: percent,
    format: fixed(0),
    chart: { range: [0, 100] },
  },
  mainVoltage: {
    label: 'Main voltage',
    group: 'fuelling',
    unit: () => 'V',
    toDisplay: same,
    format: fixed(1),
    chart: {},
  },
  injectorPulseUs: {
    label: 'Injector pulse',
    group: 'fuelling',
    unit: () => 'ms',
    toDisplay: (sample) => sample / 1000,
    format: fixed(2),
    chart: {},
  },
  lambdaShortOdd: trim('Short trim, odd'),
  lambdaShortEven: trim('Short trim, even'),
  lambdaLongOdd: trim('Long trim, odd'),
  lambdaLongEven: trim('Long trim, even'),
  gear: {
    label: 'Gear',
    group: 'states',
    unit: () => undefined,
    toDisplay: same,
    format: (display) => formatGear(display as Gear),
    chart: { step: true, range: [0, 3] },
  },
  fuelMapRow: mapPosition('Fuel map row', 8),
  fuelMapColumn: mapPosition('Fuel map column', 16),
  idleMode: onOff('Idle control', 'Active', 'normal'),
  milOn: onOff('MIL', 'On', 'warn'),
  fuelPumpOn: onOff('Fuel pump relay', 'Running', 'good'),
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
  // Recordings made before a metric existed have no value for it.
  const value = snapshot[key] as LiveSnapshot[MetricKey] | undefined;

  return typeof value === 'boolean' ? Number(value) : (value ?? null);
}

/** Formats a sample for display, with the user's units. */
export function formatSample(
  metric: Metric,
  sample: number,
  units: DisplayUnits,
): string {
  return metric.format(metric.toDisplay(sample, units));
}

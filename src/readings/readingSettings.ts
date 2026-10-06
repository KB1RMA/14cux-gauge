// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { METRIC_KEYS, type MetricKey } from '../metrics';
import { asRecord } from '../storage/settings';

export const READINGS_KEY = 'readings';

/** Read on every pass whatever is chosen: the MIL is a safety warning. */
export const ALWAYS_READ: readonly MetricKey[] = ['milOn'];

export interface ReadingSettings {
  /**
   * Readings the user has turned off. Stored this way round so a reading
   * added in a later version is read by default.
   */
  off: MetricKey[];
}

export function parseReadingSettings(stored: unknown): ReadingSettings {
  const s = asRecord(stored);
  const off = Array.isArray(s['off']) ? (s['off'] as unknown[]) : [];

  return {
    off: METRIC_KEYS.filter(
      (key) => off.includes(key) && !ALWAYS_READ.includes(key),
    ),
  };
}

/** The chosen readings, in display order, always including `ALWAYS_READ`. */
export function chosenReadings(off: readonly MetricKey[]): MetricKey[] {
  return METRIC_KEYS.filter(
    (key) => ALWAYS_READ.includes(key) || !off.includes(key),
  );
}

/** The `off` list that leaves exactly `keys` (and `ALWAYS_READ`) chosen. */
export function offExcept(keys: readonly MetricKey[]): MetricKey[] {
  return METRIC_KEYS.filter(
    (key) => !keys.includes(key) && !ALWAYS_READ.includes(key),
  );
}

export interface ReadingPreset {
  name: string;
  keys: readonly MetricKey[];
}

/** Quick choices for common jobs. "All" is offered separately. */
export const READING_PRESETS: readonly ReadingPreset[] = [
  {
    name: 'Idle',
    keys: [
      'engineRpm',
      'targetIdleRpm',
      'coolantTempF',
      'throttle',
      'idleBypass',
      'idleMode',
    ],
  },
  {
    name: 'Fuelling',
    keys: [
      'engineRpm',
      'throttle',
      'airflow',
      'injectorPulseUs',
      'injectorDuty',
      'lambdaShortOdd',
      'lambdaShortEven',
      'lambdaLongOdd',
      'lambdaLongEven',
      'fuelMapRow',
      'fuelMapColumn',
    ],
  },
  {
    name: 'Temperatures and electrics',
    keys: [
      'coolantTempF',
      'fuelTempF',
      'mainVoltage',
      'fuelPumpOn',
      'purgeValve',
      'acCompressorOn',
      'screenHeaterOn',
    ],
  },
];

// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import * as z from 'zod/mini';
import { METRIC_KEYS, type MetricKey } from '../metrics';

/** What the Dash view shows until the user chooses. */
export const DEFAULT_DASH_READINGS: readonly MetricKey[] = [
  'engineRpm',
  'roadSpeedMph',
  'coolantTempF',
  'mainVoltage',
  'milOn',
];

export interface DashSettings {
  /** The readings the Dash view shows, in the order of `METRIC_KEYS`. */
  readings: MetricKey[];
}

/**
 * The readings stored for the Dash view: the known ones, in display order,
 * or the default list when nothing usable is stored. An empty list is a
 * choice and is kept.
 */
export const dashReadings = z.pipe(
  z.catch(z.unknown(), undefined),
  z.transform((stored) =>
    Array.isArray(stored)
      ? METRIC_KEYS.filter((key) => stored.includes(key))
      : [...DEFAULT_DASH_READINGS],
  ),
);

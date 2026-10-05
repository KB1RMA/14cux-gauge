// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Gear } from 'comm14cux-ts';
import type { LiveSnapshot } from '../ecu/poller';

/** A complete snapshot with plausible idle values, for tests to vary. */
export function snapshotAt(
  timestamp: number,
  changes: Partial<LiveSnapshot> = {},
): LiveSnapshot {
  return {
    timestamp,
    engineRpm: 750,
    roadSpeedMph: 0,
    throttle: 0.02,
    airflow: 0.1,
    lambdaShortOdd: 0,
    lambdaShortEven: 0,
    idleBypass: 0.5,
    gear: Gear.ParkOrNeutral,
    milOn: false,
    fuelPumpOn: true,
    coolantTempF: 190,
    fuelTempF: 95,
    mainVoltage: 14.1,
    lambdaLongOdd: 0,
    lambdaLongEven: 0,
    ...changes,
  };
}

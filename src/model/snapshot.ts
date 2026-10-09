// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Gear, PurgeValveState } from '@kb1rma/libcomm14cux-ts';
import * as z from 'zod/mini';

/**
 * One pass over the live values, as the poller takes it and as a recording
 * keeps it. Units are those the library returns, at full precision.
 */

/** A reading that may be missing (not read) or `null` (invalid). */
function reading<T extends z.ZodMiniType>(value: T) {
  return z.exactOptional(z.nullable(value));
}

const number = z.number();
const flag = z.boolean();

/**
 * One pass over the live values. Only the readings asked for are present: a
 * missing key was not read, while `null` is a reading the ECU got wrong.
 *
 * `gear` and `purgeValve` are kept as the library's numbers; a test pins
 * them, since recordings depend on them not changing.
 */
export const liveSnapshotSchema = z.object({
  /** `Date.now()` when the pass finished. */
  timestamp: number,
  engineRpm: reading(number),
  roadSpeedMph: reading(number),
  /** Fraction 0–1, corrected for the throttle's closed position. */
  throttle: reading(number),
  /** Linearised airflow, as a fraction 0–1 of the meter's range. */
  airflow: reading(number),
  lambdaShortOdd: reading(number),
  lambdaShortEven: reading(number),
  /** Fraction 0–1 (0 closed). */
  idleBypass: reading(number),
  gear: reading(z.literal(Object.values(Gear))),
  milOn: reading(flag),
  fuelPumpOn: reading(flag),
  /** Injector pulse width in microseconds. */
  injectorPulseUs: reading(number),
  /**
   * The fuel map cell the ECU is using, counted from 0, with the
   * interpolation weighting towards the next row or column as the fraction:
   * 2.5 is halfway between rows 2 and 3.
   */
  fuelMapRow: reading(number),
  fuelMapColumn: reading(number),
  // Slow-changing values, read every `slowEvery` passes.
  coolantTempF: reading(number),
  fuelTempF: reading(number),
  mainVoltage: reading(number),
  lambdaLongOdd: reading(number),
  lambdaLongEven: reading(number),
  /** Whether the ECU is controlling the idle speed. */
  idleMode: reading(flag),
  targetIdleRpm: reading(number),
  /**
   * The CO trim potentiometer's voltage. Only a tune without lambda feedback
   * uses it; the ECU keeps it where a closed loop tune keeps the even bank's
   * long term trim.
   */
  coTrimVoltage: reading(number),
  purgeValve: reading(z.literal(Object.values(PurgeValveState))),
  acCompressorOn: reading(flag),
  screenHeaterOn: reading(flag),
});

export type LiveSnapshot = z.infer<typeof liveSnapshotSchema>;

export type ReadingKey = Exclude<keyof LiveSnapshot, 'timestamp'>;

/** A reading, or `null` if the ECU returned a value outside its valid range. */
export type Reading<T> = T | null;

/** Every live value the poller can read, each present. */
export type LiveReadings = {
  [K in ReadingKey]-?: Reading<NonNullable<LiveSnapshot[K]>>;
};

/**
 * Whether `raw` looks like a snapshot: an object with a time. Cheap enough to
 * run over every sample of a long recording, unlike a full parse, so storage
 * uses it when reading samples back.
 */
export function isSnapshotLike(raw: unknown): raw is LiveSnapshot {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    typeof (raw as { timestamp?: unknown }).timestamp === 'number'
  );
}

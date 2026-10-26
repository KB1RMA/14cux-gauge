// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors

/**
 * A reading's limits: up to four levels, each a sample in the library's
 * units (°F, mph, a 0–1 fraction…), never a display value. A low level is
 * reached at or below it, a high level at or above it. A missing level is
 * not set.
 */
export const LIMIT_LEVELS = [
  'lowAlert',
  'lowWarn',
  'highWarn',
  'highAlert',
] as const;

export type LimitLevel = (typeof LIMIT_LEVELS)[number];

export type Limits = Partial<Record<LimitLevel, number>>;

/** No levels set. */
export const NO_LIMITS: Limits = {};

/** Whether two sets of limits have the same levels at the same values. */
export function sameLimits(a: Limits, b: Limits): boolean {
  return LIMIT_LEVELS.every((level) => a[level] === b[level]);
}

/**
 * The level `sample` reaches, if any: an alert before a warning, so the
 * most serious one applies.
 */
export function limitReached(
  limits: Limits,
  sample: number,
): LimitLevel | undefined {
  const { lowAlert, lowWarn, highWarn, highAlert } = limits;

  if (highAlert !== undefined && sample >= highAlert) {
    return 'highAlert';
  }

  if (lowAlert !== undefined && sample <= lowAlert) {
    return 'lowAlert';
  }

  if (highWarn !== undefined && sample >= highWarn) {
    return 'highWarn';
  }

  return lowWarn !== undefined && sample <= lowWarn ? 'lowWarn' : undefined;
}

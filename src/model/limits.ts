// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import * as z from 'zod/mini';

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

/**
 * The levels set in `limits` that are out of order: each of a pair where a
 * level is below the one before it, or a high level is at or below a low
 * one, so a value could be both. Levels on one side may meet.
 */
export function levelsOutOfOrder(limits: Limits): LimitLevel[] {
  const set = LIMIT_LEVELS.flatMap((level) => {
    const value = limits[level];

    return value === undefined ? [] : [{ level, value }];
  });
  const wrong = new Set<LimitLevel>();

  set.forEach((current, index) => {
    const previous = set[index - 1];

    if (!previous) {
      return;
    }

    const crosses =
      previous.level.startsWith('low') && current.level.startsWith('high');

    if (
      crosses ? previous.value >= current.value : previous.value > current.value
    ) {
      wrong.add(previous.level).add(current.level);
    }
  });

  return LIMIT_LEVELS.filter((level) => wrong.has(level));
}

/** What the user is told about levels out of order. */
export const OUT_OF_ORDER =
  'Each level must be above the one before it: very low, low, high, very high.';

/**
 * A reading's limits, as stored and as typed: finite numbers in order. Each
 * level of a pair out of order gets an issue, so both can be marked.
 */
export const limitsSchema = z
  .object({
    lowAlert: z.exactOptional(z.number()),
    lowWarn: z.exactOptional(z.number()),
    highWarn: z.exactOptional(z.number()),
    highAlert: z.exactOptional(z.number()),
  })
  .check(
    z.superRefine((limits, ctx) => {
      for (const level of levelsOutOfOrder(limits)) {
        ctx.issues.push({
          code: 'custom',
          message: OUT_OF_ORDER,
          path: [level],
          input: limits[level],
        });
      }
    }),
  );

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

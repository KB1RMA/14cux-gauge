// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import * as z from 'zod/mini';
import {
  METRICS,
  type Metric,
  type MetricKey,
  type MetricLimits,
} from '../metrics';
import { fieldsOf } from '../model/record';
import {
  LIMIT_LEVELS,
  limitsSchema,
  sameLimits,
  type Limits,
} from '../model/limits';

/** A reading a user can set limits on. */
export type LimitMetric = Metric & { limits: MetricLimits };

/** The readings a user can set limits on, in display order. */
export const LIMIT_METRICS: readonly LimitMetric[] = METRICS.filter(
  (metric): metric is LimitMetric => metric.limits !== undefined,
);

/**
 * The user's own limits, by reading, in library units. A reading missing
 * here uses its suggested limits; one present with no levels has had every
 * level cleared.
 */
export type OwnLimits = Partial<Record<MetricKey, Limits>>;

/** One reading's stored levels: finite numbers only; anything else is unset. */
function storedLimits(stored: unknown): Limits {
  const fields = fieldsOf(stored);
  const limits: Limits = {};

  for (const level of LIMIT_LEVELS) {
    const value = fields[level];

    if (typeof value === 'number' && Number.isFinite(value)) {
      limits[level] = value;
    }
  }

  return limits;
}

/**
 * The limits stored for each reading that takes them. A reading with
 * nothing usable stored, levels out of order (which the Limits section
 * never stores), or that does not take limits, is left out, so it uses its
 * suggestion.
 */
export const ownLimits = z.pipe(
  z.catch(z.unknown(), undefined),
  z.transform((stored): OwnLimits => {
    const fields = fieldsOf(stored);
    const own: OwnLimits = {};

    for (const { key } of LIMIT_METRICS) {
      const entry = fields[key];

      if (typeof entry !== 'object' || entry === null) {
        continue;
      }

      const parsed = limitsSchema.safeParse(storedLimits(entry));

      if (parsed.success) {
        own[key] = parsed.data;
      }
    }

    return own;
  }),
);

/** The limits that apply to `metric`: the user's own, or the suggestion. */
export function limitsFor(metric: LimitMetric, own: OwnLimits): Limits;
export function limitsFor(metric: Metric, own: OwnLimits): Limits | undefined;

export function limitsFor(metric: Metric, own: OwnLimits): Limits | undefined {
  return own[metric.key] ?? metric.limits?.suggested;
}

/**
 * `own` with `limits` set for `metric`. Limits the same as the suggestion
 * are not the user's own, so the reading goes back to the suggestion.
 */
export function withLimits(
  own: OwnLimits,
  metric: LimitMetric,
  limits: Limits,
): OwnLimits {
  const { [metric.key]: _previous, ...others } = own;

  return sameLimits(limits, metric.limits.suggested)
    ? others
    : { ...others, [metric.key]: limits };
}

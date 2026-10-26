// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import * as z from 'zod/mini';
import { formatSample, type DisplayUnits } from '../metrics';
import {
  LIMIT_LEVELS,
  limitsSchema,
  type LimitLevel,
  type Limits,
} from '../model/limits';
import type { LimitMetric } from './limitSettings';

export const LEVEL_LABELS: Record<LimitLevel, string> = {
  lowAlert: 'Very low',
  lowWarn: 'Low',
  highWarn: 'High',
  highAlert: 'Very high',
};

/** What each field holds as typed, in display units; empty is unset. */
export type LimitTexts = Record<LimitLevel, string>;

/** A plain decimal number, as typed: no exponent, hex or other forms. */
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** `limits` as the fields first show them: formatted as the reading is. */
export function limitTexts(
  metric: LimitMetric,
  limits: Limits,
  units: DisplayUnits,
): LimitTexts {
  const text = (level: LimitLevel) => {
    const sample = limits[level];

    return sample === undefined ? '' : formatSample(metric, sample, units);
  };

  return {
    lowAlert: text('lowAlert'),
    lowWarn: text('lowWarn'),
    highWarn: text('highWarn'),
    highAlert: text('highAlert'),
  };
}

/**
 * Turns one reading's fields, in display units, into limits in library
 * units, checked as stored limits are (`limitsSchema`). A field still
 * showing what `limitTexts(applied)` showed keeps the applied sample, so
 * leaving a field never moves a level by rounding it for display. A changed
 * field must be a plain number with no more decimals than the reading
 * shows, so it reads back as typed. Each issue is on the level it concerns.
 */
export function limitFormSchema(
  metric: LimitMetric,
  units: DisplayUnits,
  applied: Limits,
) {
  const shown = limitTexts(metric, applied, units);

  const typed = z.pipe(
    z.object({
      lowAlert: z.string(),
      lowWarn: z.string(),
      highWarn: z.string(),
      highAlert: z.string(),
    }),
    z.transform((texts: LimitTexts, ctx): Limits => {
      const limits: Limits = {};

      for (const level of LIMIT_LEVELS) {
        const text = texts[level].trim();

        const issue = (message: string) => {
          ctx.issues.push({
            code: 'custom',
            message: `${LEVEL_LABELS[level]}: ${message}`,
            path: [level],
            input: texts[level],
          });
        };

        if (text === '') {
          continue;
        }

        const appliedSample = applied[level];

        if (text === shown[level] && appliedSample !== undefined) {
          limits[level] = appliedSample;
          continue;
        }

        const display = Number(text);

        if (!DECIMAL.test(text) || !Number.isFinite(display)) {
          issue('enter a number.');
          continue;
        }

        const asShown = metric.format(display);

        if (Number(asShown) !== display) {
          issue(`enter it as the reading shows it, such as ${asShown}.`);
          continue;
        }

        limits[level] = metric.limits.fromDisplay(display, units);
      }

      return limits;
    }),
  );

  return z.pipe(typed, limitsSchema);
}

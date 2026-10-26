// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useId, useRef, useState } from 'react';
import { describeLimits, formatSample, type DisplayUnits } from '../metrics';
import { LIMIT_LEVELS, type LimitLevel, type Limits } from '../model/limits';
import { usePreferences } from '../preferences/usePreferences';
import {
  LIMIT_METRICS,
  type LimitMetric,
  limitsFor,
  withLimits,
  type OwnLimits,
} from '../settings/limitSettings';
import styles from './LimitsPreferences.module.css';

const LEVEL_LABELS: Record<LimitLevel, string> = {
  lowAlert: 'Very low',
  lowWarn: 'Low',
  highWarn: 'High',
  highAlert: 'Very high',
};

/** What each field holds as typed, in display units; empty is unset. */
type Texts = Record<LimitLevel, string>;

/** A level as the field first shows it: formatted as the reading is. */
function textsOf(
  metric: LimitMetric,
  limits: Limits,
  units: DisplayUnits,
): Texts {
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

type Checked =
  { limits: Limits; error?: undefined } | { error: string; level: LimitLevel };

/**
 * Turns one reading's fields into limits in library units. A field left as
 * it was shown keeps the stored sample, so leaving a field never moves a
 * level by rounding it for display. A changed field must be a number with
 * no more decimals than the reading shows, so it reads back as typed.
 */
function check(
  metric: LimitMetric,
  texts: Texts,
  initial: Texts,
  stored: Limits,
  units: DisplayUnits,
): Checked {
  const limits: Limits = {};

  for (const level of LIMIT_LEVELS) {
    const text = texts[level].trim();
    const storedSample = stored[level];

    if (text === '') {
      continue;
    }

    if (text === initial[level] && storedSample !== undefined) {
      limits[level] = storedSample;
      continue;
    }

    const display = Number(text);

    if (!Number.isFinite(display)) {
      return { error: `${LEVEL_LABELS[level]}: enter a number.`, level };
    }

    const shown = metric.format(display);

    if (Number(shown) !== display) {
      return {
        error: `${LEVEL_LABELS[level]}: enter it as the reading shows it, such as ${shown}.`,
        level,
      };
    }

    limits[level] = metric.limits.fromDisplay(display, units);
  }

  const set = LIMIT_LEVELS.flatMap((level) => {
    const sample = limits[level];

    return sample === undefined ? [] : [{ level, sample }];
  });
  const outOfOrder = set.find((current, index) => {
    const previous = set[index - 1];

    if (!previous) {
      return false;
    }

    // Levels on one side may meet, but a high level must be above every
    // low one, or a value could be both.
    return previous.level.startsWith('low') && current.level.startsWith('high')
      ? previous.sample >= current.sample
      : previous.sample > current.sample;
  });

  return outOfOrder
    ? {
        error:
          'Each level must be above the one before it: very low, low, high, very high.',
        level: outOfOrder.level,
      }
    : { limits };
}

/** Says whose limits apply to `metric`, and what the suggestion is. */
function Status({
  metric,
  own,
  units,
}: {
  metric: LimitMetric;
  own: OwnLimits;
  units: DisplayUnits;
}) {
  const suggestion = describeLimits(metric, metric.limits.suggested, units);

  if (own[metric.key] === undefined) {
    return (
      <p className={styles['status']}>
        {suggestion.length > 0 ? 'Suggested limits.' : 'No limits set.'}
      </p>
    );
  }

  return (
    <p className={styles['status']}>
      Your limits.{' '}
      {suggestion.length > 0
        ? `Suggested: ${suggestion.join(', ')}.`
        : 'No limits are suggested.'}
    </p>
  );
}

/**
 * One reading's four levels. A reading's limits apply as soon as the user
 * leaves one of its fields (presses Enter, or closes Preferences) with every
 * field valid, as the
 * other preferences apply at once. Otherwise it says what is wrong beside the
 * field, and the limits that applied stay as they were.
 */
function ReadingFields({
  metric,
  units,
}: {
  metric: LimitMetric;
  units: DisplayUnits;
}) {
  const { ownLimits, setOwnLimits } = usePreferences();
  const id = useId();
  const applied = limitsFor(metric, ownLimits);
  const shown = textsOf(metric, applied, units);
  // What the user is typing, until it applies; `undefined` shows `applied`.
  const [draft, setDraft] = useState<Texts | undefined>(undefined);
  const [error, setError] = useState<
    { message: string; level: LimitLevel } | undefined
  >(undefined);
  const texts = draft ?? shown;
  const unit = metric.unit(units);
  const { suggested } = metric.limits;

  const commit = () => {
    if (draft === undefined) {
      return;
    }

    const checked = check(metric, draft, shown, applied, units);

    if (checked.error !== undefined) {
      setError({ message: checked.error, level: checked.level });

      return;
    }

    setError(undefined);
    setDraft(undefined);
    setOwnLimits(withLimits(ownLimits, metric, checked.limits));
  };

  const commitRef = useRef(commit);

  useEffect(() => {
    commitRef.current = commit;
  });
  // Closing Preferences or changing section removes the field without it
  // losing focus first, so apply what was typed then too.
  useEffect(
    () => () => {
      commitRef.current();
    },
    [],
  );

  return (
    <fieldset className={styles['reading']}>
      <legend className={styles['legend']}>
        {metric.label}
        {unit ? (
          <>
            {' '}
            <span className={styles['unit']}>({unit})</span>
          </>
        ) : null}
      </legend>
      <Status metric={metric} own={ownLimits} units={units} />
      {metric.limits.basis ? (
        <p className={styles['basis']}>{metric.limits.basis(units)}</p>
      ) : null}
      <div className={styles['fields']}>
        {LIMIT_LEVELS.map((level) => (
          <label key={level} className={styles['field']}>
            {LEVEL_LABELS[level]}
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              value={texts[level]}
              aria-invalid={error?.level === level ? true : undefined}
              aria-describedby={error?.level === level ? id : undefined}
              onChange={(event) => {
                setDraft({ ...texts, [level]: event.target.value });
              }}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commit();
                }
              }}
            />
          </label>
        ))}
      </div>
      {error ? (
        <p id={id} role="alert" className={styles['error']}>
          {error.message}
        </p>
      ) : null}
      {ownLimits[metric.key] === undefined ? null : (
        <button
          type="button"
          className={styles['reset']}
          onClick={() => {
            setError(undefined);
            setDraft(undefined);
            setOwnLimits(withLimits(ownLimits, metric, suggested));
          }}
        >
          {Object.keys(suggested).length > 0
            ? 'Use suggested limits'
            : 'Clear my limits'}
        </button>
      )}
    </fieldset>
  );
}

/**
 * Where the user sets each continuous reading's limits, in their display
 * units: the Limits section of Preferences.
 */
export function LimitsPreferences() {
  const units = usePreferences();

  return (
    <div className={styles['limits']}>
      <p className={styles['description']}>
        A live reading at a limit is marked in words and colour on the Overview
        and the Dash, dials show the limits as bands, and graphs as dashed
        lines. Low limits apply at or below the value, high limits at or above
        it. Suggested limits are a starting point from what owners report for
        the 14CUX, not a statement of what is safe for your engine; change them
        to suit it. Replays do not show limits.
      </p>
      {LIMIT_METRICS.map((metric) => (
        <ReadingFields key={metric.key} metric={metric} units={units} />
      ))}
    </div>
  );
}

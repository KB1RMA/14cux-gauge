// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { describeLimits, type DisplayUnits } from '../metrics';
import { LIMIT_LEVELS, sameLimits, type Limits } from '../model/limits';
import { usePreferences } from '../preferences/usePreferences';
import {
  LEVEL_LABELS,
  limitFormSchema,
  limitTexts,
  type LimitTexts,
} from '../settings/limitForm';
import {
  LIMIT_METRICS,
  type LimitMetric,
  limitsFor,
  type OwnLimits,
} from '../settings/limitSettings';
import type { PendingEdits } from './pendingEdits';
import styles from './LimitsPreferences.module.css';

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
 * One reading's four levels, a form checked by `limitFormSchema`. A
 * reading's limits apply as soon as the user leaves one of its fields or
 * presses Enter with every field valid, as the other preferences apply at
 * once; closing Preferences or changing section applies them too.
 * Otherwise it says what is wrong beside the field, the limits that applied
 * stay as they were, and the first attempt to close stays open on the
 * field; closing again drops what was typed.
 */
function ReadingFields({
  metric,
  units,
  pending,
}: {
  metric: LimitMetric;
  units: DisplayUnits;
  pending: PendingEdits;
}) {
  const { ownLimits, setReadingLimits } = usePreferences();
  const id = useId();
  const applied = limitsFor(metric, ownLimits);
  const shown = limitTexts(metric, applied, units);
  const schema = limitFormSchema(metric, units, applied);
  const unit = metric.unit(units);
  const {
    register,
    getValues,
    reset,
    trigger,
    setFocus,
    formState: { errors },
  } = useForm<LimitTexts, unknown, Limits>({
    // Follows the limits that apply, keeping what the user is typing.
    values: shown,
    resetOptions: { keepDirtyValues: true },
    resolver: zodResolver(schema),
    // Checked when a field is first left, then as the user types.
    mode: 'onTouched',
  });
  // An attempt to close was held open to show an error, until the next edit.
  const [heldOpen, setHeldOpen] = useState(false);

  const showLimits = (limits: Limits) => {
    // Replaces what was typed; `resetOptions` apply to every reset otherwise.
    reset(limitTexts(metric, limits, units), { keepDirtyValues: false });
    setHeldOpen(false);
  };

  /** Applies what was typed, if it changed and is valid; see `ApplyEdits`. */
  const apply = (closing: boolean, focus: boolean): boolean => {
    const texts = getValues();

    if (LIMIT_LEVELS.every((level) => texts[level] === shown[level])) {
      return true;
    }

    const parsed = schema.safeParse(texts);

    if (parsed.success) {
      if (!sameLimits(parsed.data, applied)) {
        setReadingLimits(metric, parsed.data);
      }

      showLimits(parsed.data);

      return true;
    }

    void trigger();

    if (!closing || heldOpen) {
      return true;
    }

    setHeldOpen(true);

    const level = LIMIT_LEVELS.find((known) =>
      parsed.error.issues.some((issue) => issue.path[0] === known),
    );

    if (focus && level) {
      setFocus(level);
    }

    return false;
  };

  const applyRef = useRef(apply);

  useEffect(() => {
    applyRef.current = apply;
  });
  useEffect(
    () => pending.add((focus) => applyRef.current(true, focus)),
    [pending],
  );
  // Leaving by Back removes the fields without closing first, so apply
  // what was typed then too, if it is valid.
  useEffect(
    () => () => {
      applyRef.current(false, false);
    },
    [],
  );

  const messages = [
    ...new Set(LIMIT_LEVELS.flatMap((level) => errors[level]?.message ?? [])),
  ];

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
        {LIMIT_LEVELS.map((level) => {
          const invalid = errors[level] !== undefined;
          const field = register(level, {
            onChange: () => {
              setHeldOpen(false);
            },
            onBlur: () => {
              apply(false, false);
            },
          });

          return (
            <label key={level} className={styles['field']}>
              {LEVEL_LABELS[level]}
              <input
                {...field}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                aria-invalid={invalid ? true : undefined}
                aria-describedby={invalid ? id : undefined}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    apply(false, false);
                  }
                }}
              />
            </label>
          );
        })}
      </div>
      {messages.length > 0 ? (
        <p id={id} role="alert" className={styles['error']}>
          {messages.join(' ')}
          {heldOpen ? ' Close again to discard the change.' : null}
        </p>
      ) : null}
      {ownLimits[metric.key] === undefined ? null : (
        <button
          type="button"
          className={styles['reset']}
          onClick={() => {
            setReadingLimits(metric, metric.limits.suggested);
            showLimits(metric.limits.suggested);
          }}
        >
          {Object.keys(metric.limits.suggested).length > 0
            ? 'Use suggested limits'
            : 'Clear my limits'}
        </button>
      )}
    </fieldset>
  );
}

/**
 * Where the user sets each continuous reading's limits, in their display
 * units: the Limits section of Preferences. `pending` lets Preferences apply
 * what was typed before it closes.
 */
export function LimitsPreferences({ pending }: { pending: PendingEdits }) {
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
        <ReadingFields
          key={metric.key}
          metric={metric}
          units={units}
          pending={pending}
        />
      ))}
    </div>
  );
}

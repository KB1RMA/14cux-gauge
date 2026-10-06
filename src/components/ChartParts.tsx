// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { VisuallyHidden } from 'radix-ui';
import styles from './TimeSeriesChart.module.css';

function Stat({
  term,
  value,
  format,
}: {
  term: string;
  value: number | null | undefined;
  format(value: number): string;
}) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>
        {value === null ? (
          <>
            <span aria-hidden="true">—</span>
            <VisuallyHidden.Root>No valid reading</VisuallyHidden.Root>
          </>
        ) : value === undefined ? (
          <>
            <span aria-hidden="true">—</span>
            <VisuallyHidden.Root>No data yet</VisuallyHidden.Root>
          </>
        ) : (
          format(value)
        )}
      </dd>
    </div>
  );
}

/**
 * A graph's values as text: the current one, and (except for on/off and
 * enumerated readings, where they mean little) the lowest and highest.
 */
export function ChartStats({
  now,
  min,
  max,
  step,
  format,
}: {
  now: number | null | undefined;
  min: number | undefined;
  max: number | undefined;
  step: boolean | undefined;
  format(value: number): string;
}) {
  return (
    <dl className={styles['stats']}>
      <Stat term="Now" value={now} format={format} />
      {step ? null : (
        <>
          <Stat term="Min" value={min} format={format} />
          <Stat term="Max" value={max} format={format} />
        </>
      )}
    </dl>
  );
}

/** A graph's caption: the metric's name and its unit. */
export function ChartCaption({
  id,
  label,
  unit,
}: {
  id: string;
  label: string;
  unit: string | undefined;
}) {
  return (
    <figcaption id={id} className={styles['caption']}>
      {label}
      {unit ? (
        <>
          {' '}
          <span className={styles['unit']}>({unit})</span>
        </>
      ) : null}
    </figcaption>
  );
}

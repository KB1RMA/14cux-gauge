// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { VisuallyHidden } from 'radix-ui';
import type { ReactNode } from 'react';
import styles from './Tile.module.css';

export type TileTone = 'normal' | 'good' | 'warn' | 'alert';

export interface TileProps {
  label: string;
  /** Formatted value; `null` is an invalid reading, `undefined` not read yet. */
  value: string | null | undefined;
  unit?: string | undefined;
  /** Colour emphasis only; the value or `note` must carry the meaning. */
  tone?: TileTone;
  /** A word or two after the value, such as "maxed out". */
  note?: string | undefined;
  /** An explanation control shown beside the label, such as `MetricInfo`. */
  info?: ReactNode;
}

/** One name/value pair. Render inside a `<dl>`. */
export function Tile({
  label,
  value,
  unit,
  tone = 'normal',
  note,
  info,
}: TileProps) {
  return (
    <div className={styles['tile']} data-tone={tone}>
      <dt className={styles['label']}>
        {label}
        {info}
      </dt>
      <dd className={styles['value']}>
        {value === null ? (
          <>
            <span aria-hidden="true">—</span>
            <VisuallyHidden.Root>No valid reading</VisuallyHidden.Root>
          </>
        ) : value === undefined ? (
          <VisuallyHidden.Root>Waiting for data</VisuallyHidden.Root>
        ) : (
          <>
            {value}
            {unit ? <span className={styles['unit']}> {unit}</span> : null}
            {note ? <span className={styles['note']}> {note}</span> : null}
          </>
        )}
      </dd>
    </div>
  );
}

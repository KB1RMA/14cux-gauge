// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { VisuallyHidden } from 'radix-ui';
import styles from './Tile.module.css';

export type TileTone = 'normal' | 'good' | 'warn';

export interface TileProps {
  label: string;
  /** Formatted value; `null` is an invalid reading, `undefined` not read yet. */
  value: string | null | undefined;
  unit?: string;
  /** Colour emphasis only; the value text must carry the meaning by itself. */
  tone?: TileTone;
}

/** One name/value pair. Render inside a `<dl>`. */
export function Tile({ label, value, unit, tone = 'normal' }: TileProps) {
  return (
    <div className={styles['tile']} data-tone={tone}>
      <dt className={styles['label']}>{label}</dt>
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
          </>
        )}
      </dd>
    </div>
  );
}

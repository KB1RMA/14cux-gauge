// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { meterSpan, type Metric } from '../metrics';
import styles from './Meter.module.css';

/**
 * A bar picturing a reading on its meter's fixed range. Hidden from
 * assistive tech: the value text beside it is the reading. With no valid
 * sample it keeps its space but draws nothing, so it never looks like 0.
 */
export function Meter({
  meter,
  display,
}: {
  meter: NonNullable<Metric['meter']>;
  /** The display value, or `null` / `undefined` when there is no reading. */
  display: number | null | undefined;
}) {
  const span = display == null ? undefined : meterSpan(meter, display);

  return (
    <span
      aria-hidden="true"
      className={styles['meter']}
      data-centred={meter.centred ? '' : undefined}
      data-empty={span ? undefined : ''}
    >
      <span className={styles['track']}>
        {span ? (
          <span
            className={styles['fill']}
            style={{
              left: `${span[0] * 100}%`,
              width: `${(span[1] - span[0]) * 100}%`,
            }}
          />
        ) : null}
      </span>
    </span>
  );
}

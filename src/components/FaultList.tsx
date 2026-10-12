// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { FaultDescription } from '../faultCodes';
import styles from './Panel.module.css';

/** Fault codes as a list, each with its number, meaning and library name. */
export function FaultList({
  faults,
  label,
}: {
  faults: readonly FaultDescription[];
  /** The list's accessible name. */
  label: string;
}) {
  return (
    <ul aria-label={label} className={styles['faults']}>
      {faults.map(({ name, number, label: meaning }) => (
        <li key={name}>
          {number === undefined ? null : (
            <>
              {number} <span aria-hidden="true">·</span>{' '}
            </>
          )}
          {meaning} <code>{name}</code>
        </li>
      ))}
    </ul>
  );
}

// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEcuWrite } from '../ecuWrite/useEcuWrite';
import { WRITES } from '../ecuWrite/writes';
import type { WriteId } from '../model/write';
import styles from './Panel.module.css';

/**
 * How a write last went on this connection, the same way for every write,
 * kept beside its controls. Nothing while it runs. Not a live region: the
 * write's notification already announces it.
 */
export function WriteResult({ id }: { id: WriteId }) {
  const outcome = useEcuWrite().outcomes[id];

  if (!outcome || outcome.status === 'running') {
    return null;
  }

  return (
    <p
      className={`${styles['result'] ?? ''} ${outcome.status === 'done' ? '' : (styles['error'] ?? '')}`}
    >
      {outcome.message}
    </p>
  );
}

/**
 * Says why controls that use the link are disabled while a write runs: a
 * different write's (`id`), or another holder's, such as the ROM read. Point
 * the disabled controls' `aria-describedby` at `noteId`.
 */
export function WriteBlocked({ id, noteId }: { id?: WriteId; noteId: string }) {
  const { running } = useEcuWrite();

  if (running === undefined || running === id) {
    return null;
  }

  return (
    <p id={noteId} className={styles['muted']}>
      Disabled while {id ? 'another' : 'a'} write to the ECU runs:{' '}
      {WRITES[running].name}.
    </p>
  );
}

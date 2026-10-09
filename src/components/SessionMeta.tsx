// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  formatDateTime,
  formatDuration,
  sourceLabel,
} from '../sessions/format';
import type { SessionSummary } from '../model/session';
import styles from './Sessions.module.css';

/** When, how long and from what a session was recorded. */
export function SessionMeta({
  session,
  recording,
}: {
  session: SessionSummary;
  /** Whether this session is being recorded now. */
  recording: boolean;
}) {
  let length: string;

  if (recording) {
    length = 'Recording…';
  } else if (session.endedAt === null) {
    // The page closed before recording stopped.
    length = 'Unfinished';
  } else {
    length = formatDuration(session.endedAt - session.startedAt);
  }

  return (
    <dl className={styles['meta']}>
      <div>
        <dt>Recorded</dt>
        <dd>{formatDateTime(session.startedAt)}</dd>
      </div>
      <div>
        <dt>Length</dt>
        <dd>{length}</dd>
      </div>
      <div>
        <dt>Samples</dt>
        <dd>{session.sampleCount.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Source</dt>
        <dd>{sourceLabel(session.source)}</dd>
      </div>
    </dl>
  );
}

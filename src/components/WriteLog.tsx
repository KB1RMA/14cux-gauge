// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { VisuallyHidden } from 'radix-ui';
import type { WriteLogEntry } from '../ecuWrite/writes';
import type { Replay } from '../replay/useReplay';
import {
  writeDetail,
  writeLength,
  writeName,
  writeStartTime,
  writeStatus,
} from '../sessions/writeLog';
import styles from './Sessions.module.css';

/**
 * The writes to the ECU made while a session was recorded, with when each
 * started, how long it ran and how it went. Each can move the playhead to
 * where it started; the one under the playhead says so.
 */
export function WriteLog({
  writes,
  keepsWrites,
  firstSampleAt,
  replay,
}: {
  writes: readonly WriteLogEntry[];
  /** Whether the session was recorded by a version that keeps writes. */
  keepsWrites: boolean;
  firstSampleAt: number;
  replay: Replay;
}) {
  const playheadAt = firstSampleAt + replay.position;

  return (
    <section aria-labelledby="write-log-title" className={styles['writeLog']}>
      <h4 id="write-log-title" className={styles['subtitle']}>
        Writes to the ECU
      </h4>
      {!keepsWrites ? (
        <p className={styles['empty']}>
          This session was recorded before writes to the ECU were kept, so any
          made during it are not shown.
        </p>
      ) : null}
      {keepsWrites && writes.length === 0 ? (
        <p className={styles['empty']}>
          No writes to the ECU were made during this recording.
        </p>
      ) : null}
      {writes.length > 0 ? (
        <div className={styles['tableScroll']}>
          <table className={styles['writes']}>
            <thead>
              <tr>
                <th scope="col">Started</th>
                <th scope="col">Write</th>
                <th scope="col">Result</th>
                <th scope="col">Length</th>
                <th scope="col">
                  <VisuallyHidden.Root>Playhead</VisuallyHidden.Root>
                </th>
              </tr>
            </thead>
            <tbody>
              {writes.map((entry) => {
                const name = writeName(entry);
                const time = writeStartTime(entry, firstSampleAt);
                const underPlayhead =
                  playheadAt >= entry.startedAt &&
                  (entry.endedAt === null || playheadAt <= entry.endedAt);

                return (
                  <tr
                    key={entry.id}
                    data-status={
                      entry.endedAt === null ? 'open' : entry.outcome.status
                    }
                  >
                    <td className={styles['time']}>
                      {time ?? 'Before the first sample'}
                    </td>
                    <th scope="row">
                      {name}
                      {underPlayhead ? (
                        <>
                          {' '}
                          <span className={styles['here']}>
                            At the playhead
                          </span>
                        </>
                      ) : null}
                    </th>
                    <td>
                      <strong>{writeStatus(entry)}.</strong>{' '}
                      {writeDetail(entry)}
                    </td>
                    <td className={styles['time']}>
                      {writeLength(entry) ?? 'Not recorded'}
                    </td>
                    <td>
                      <button
                        type="button"
                        aria-label={`Go to ${name}, ${time ?? 'at the first sample'}`}
                        onClick={() => {
                          replay.seek(entry.startedAt - firstSampleAt);
                        }}
                      >
                        Go to
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

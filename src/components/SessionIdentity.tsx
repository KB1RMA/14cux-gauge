// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { SessionSummary } from '../model/session';
import { formatTimeOfDay } from '../sessions/format';
import {
  identityRows,
  NOT_RECORDED,
  notRead,
  recordedFaults,
  withUnit,
} from '../sessions/identity';
import { FaultList } from './FaultList';
import styles from './Sessions.module.css';

function ReadAt({ at }: { at: number }) {
  return (
    <span className={styles['readAt']}>
      read{' '}
      <time dateTime={new Date(at).toISOString()}>{formatTimeOfDay(at)}</time>
    </span>
  );
}

/**
 * What a session was recorded from: the ECU's tune, rev limit and fuel map,
 * and the fault codes set when recording started, each with when it was read.
 */
export function SessionIdentity({
  session,
}: {
  session: Pick<SessionSummary, 'source' | 'identity'>;
}) {
  const { identity } = session;
  const faults = identity && recordedFaults(identity);

  return (
    <section aria-labelledby="identity-title">
      <h3 id="identity-title" className={styles['subtitle']}>
        ECU at the start
      </h3>
      {session.source === 'demo' ? (
        <p className={styles['hint']}>
          Simulated: recorded from the demo ECU, not a real one.
        </p>
      ) : null}
      {identity === null || faults === null ? (
        <p className={styles['hint']}>
          {NOT_RECORDED}. This session was recorded before the app kept the
          ECU’s identity and fault codes.
        </p>
      ) : (
        <>
          <dl className={styles['identity']}>
            {identityRows(identity).map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>
                  {withUnit(row)} <ReadAt at={row.readAt} />
                </dd>
              </div>
            ))}
          </dl>
          <h4 className={styles['minorTitle']}>
            Fault codes <ReadAt at={faults.readAt} />
          </h4>
          {faults.status === 'failed' ? (
            <p>{notRead(faults.message)}</p>
          ) : faults.faults.length === 0 ? (
            <p>No fault codes stored.</p>
          ) : (
            <FaultList
              faults={faults.faults}
              label="Fault codes at the start"
            />
          )}
        </>
      )}
    </section>
  );
}

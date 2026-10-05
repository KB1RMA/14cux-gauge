// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useRef } from 'react';
import type { ConnectionState } from '../ecu/connectionState';
import { useEcu } from '../ecu/useEcu';
import { useLiveData } from '../ecu/useLiveData';
import styles from './StatusBar.module.css';

type ActiveState = Exclude<ConnectionState, { status: 'idle' }>;

function sourceName(state: ActiveState): string {
  if (state.source.kind === 'demo') {
    return 'Demo ECU';
  }

  return state.source.doubleSpeed
    ? 'Serial ECU (15625 baud)'
    : 'Serial ECU (7812 baud)';
}

function describe(state: ActiveState): string {
  switch (state.status) {
    case 'connecting':
      return `Connecting to ${sourceName(state)}…`;
    case 'connected':
      return `${sourceName(state)} · Polling`;
    case 'error':
      return `Disconnected: ${state.message}`;
  }
}

export function StatusBar() {
  const { state, disconnect, reconnect } = useEcu();
  const { stats } = useLiveData();
  const reconnectRef = useRef<HTMLButtonElement>(null);
  const failed = state.status === 'error';

  // When the link drops, the control that had focus has usually gone with
  // the dashboard; put the user on the obvious next step.
  useEffect(() => {
    if (failed) {
      reconnectRef.current?.focus();
    }
  }, [failed]);

  if (state.status === 'idle') {
    return null;
  }

  return (
    <section
      aria-label="Connection"
      className={styles['bar']}
      data-status={state.status}
    >
      <span className={styles['indicator']} aria-hidden="true" />
      {/* Only the connection state is a live region; the sample rate below
          changes several times a second and must not be announced. */}
      <output className={styles['text']}>{describe(state)}</output>
      {state.status === 'connected' && stats.sampleRateHz > 0 ? (
        <span className={styles['rate']}>
          {stats.sampleRateHz.toFixed(1)} samples/s
        </span>
      ) : null}
      <span className={styles['actions']}>
        {failed ? (
          <button
            ref={reconnectRef}
            type="button"
            className="primary"
            onClick={() => void reconnect()}
          >
            Reconnect
          </button>
        ) : null}
        <button type="button" onClick={() => void disconnect()}>
          {failed ? 'Close' : 'Disconnect'}
        </button>
      </span>
    </section>
  );
}

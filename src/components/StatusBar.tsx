// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { DotFilledIcon, StopIcon } from '@radix-ui/react-icons';
import { useEffect, useRef } from 'react';
import type { ConnectionState } from '../ecu/connectionState';
import { useEcu } from '../ecu/useEcu';
import { useLiveData } from '../ecu/useLiveData';
import { useRecording } from '../recording/useRecording';
import { formatDuration, sourceLabel } from '../sessions/format';
import styles from './StatusBar.module.css';

type ActiveState = Exclude<ConnectionState, { status: 'idle' }>;

function sourceName(state: ActiveState): string {
  if (state.source.kind === 'demo') {
    return sourceLabel('demo');
  }

  return `${sourceLabel('serial')} (${state.source.doubleSpeed ? '15625' : '7812'} baud)`;
}

function describe(
  state: ActiveState,
  recording: boolean,
  recordingError: string | undefined,
): string {
  switch (state.status) {
    case 'connecting':
      return `Connecting to ${sourceName(state)}…`;
    case 'connected':
      if (recording) {
        return `${sourceName(state)} · Polling · Recording`;
      }

      return recordingError
        ? `${sourceName(state)} · Polling · Recording stopped: ${recordingError}`
        : `${sourceName(state)} · Polling`;
    case 'error':
      return `Disconnected: ${state.message}`;
  }
}

export function StatusBar() {
  const { state, disconnect, reconnect } = useEcu();
  const { snapshot, stats } = useLiveData();
  const recording = useRecording();
  const { active } = recording;
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
      <output className={styles['text']}>
        {describe(state, active !== undefined, recording.error)}
      </output>
      {/* Not announced: it changes every second. */}
      {active ? (
        <span className={styles['elapsed']}>
          <DotFilledIcon aria-hidden="true" className={styles['recDot']} />
          {formatDuration(
            (snapshot?.timestamp ?? active.startedAt) - active.startedAt,
          )}{' '}
          recorded
        </span>
      ) : null}
      {state.status === 'connected' && stats.sampleRateHz > 0 ? (
        <span className={styles['rate']}>
          {stats.sampleRateHz.toFixed(1)} samples/s
        </span>
      ) : null}
      <span className={styles['actions']}>
        {state.status === 'connected' ? (
          // One button that changes, so focus stays on it.
          <button
            type="button"
            disabled={!active && !recording.canRecord}
            onClick={() => {
              void (active ? recording.stop() : recording.start());
            }}
          >
            {active ? (
              <StopIcon aria-hidden="true" />
            ) : (
              <DotFilledIcon aria-hidden="true" className={styles['recDot']} />
            )}
            {active ? 'Stop recording' : 'Record'}
          </button>
        ) : null}
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
        <button
          type="button"
          onClick={() => {
            // Stopping first offers to name the recording.
            void (active ? recording.stop() : Promise.resolve()).then(
              disconnect,
            );
          }}
        >
          {failed ? 'Close' : 'Disconnect'}
        </button>
      </span>
    </section>
  );
}

// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { DotFilledIcon, StopIcon } from '@radix-ui/react-icons';
import { useRef, useState } from 'react';
import type { ConnectionState } from '../ecu/connectionState';
import { useEcu } from '../ecu/useEcu';
import { useLiveData } from '../ecu/useLiveData';
import { useEcuWrite } from '../ecuWrite/useEcuWrite';
import { describeOutcome } from '../ecuWrite/writes';
import { METRICS } from '../metrics';
import { useReadings } from '../readings/useReadings';
import { useRecording } from '../recording/useRecording';
import { formatDuration, sourceLabel } from '../sessions/format';
import { FailureDialog } from './FailureDialog';
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
  paused: boolean,
  recordingError: string | undefined,
  /** The latest ECU write's start or end, if any. */
  write: string | undefined,
): string {
  switch (state.status) {
    case 'connecting':
      return `Connecting to ${sourceName(state)}…`;

    case 'connected': {
      const writeText = write ? ` · ${write}` : '';

      if (paused) {
        return `${sourceName(state)} · Polling paused while the ROM is read${writeText}`;
      }

      if (recording) {
        return `${sourceName(state)} · Polling · Recording${writeText}`;
      }

      return recordingError
        ? `${sourceName(state)} · Polling · Recording stopped: ${recordingError}${writeText}`
        : `${sourceName(state)} · Polling${writeText}`;
    }

    case 'error':
      return `Disconnected: ${state.message}`;
  }
}

export function StatusBar() {
  const { state, disconnect, reconnect, pollingPaused } = useEcu();
  const { snapshot, stats } = useLiveData();
  const { chosen } = useReadings();
  const recording = useRecording();
  const writes = useEcuWrite();
  const latestWrite = writes.latest && writes.outcomes[writes.latest];
  const { active } = recording;
  const reconnectRef = useRef<HTMLButtonElement>(null);
  const detailsRef = useRef<HTMLButtonElement>(null);
  const failed = state.status === 'error';
  // Each failure is a new state object, so the dialog opens once for each
  // until the user closes it; Details opens it again.
  const [closedFor, setClosedFor] = useState<ConnectionState | undefined>(
    undefined,
  );
  const [reopened, setReopened] = useState(false);

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
        {describe(
          state,
          active !== undefined,
          pollingPaused,
          recording.error,
          writes.latest && latestWrite
            ? describeOutcome(writes.latest, latestWrite)
            : undefined,
        )}
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
          {chosen.length < METRICS.length
            ? `${String(chosen.length)} of ${String(METRICS.length)} readings · `
            : null}
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
            ref={detailsRef}
            type="button"
            onClick={() => {
              setReopened(true);
              setClosedFor(undefined);
            }}
          >
            Details
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
      {state.status === 'error' ? (
        <FailureDialog
          open={closedFor !== state}
          message={state.message}
          detail={state.detail}
          onClose={() => {
            setClosedFor(state);
          }}
          onCloseAutoFocus={() => {
            // Back to Details if that opened it; otherwise the link dropped
            // and took the focused control with the dashboard, so put the
            // user on the obvious next step.
            (reopened ? detailsRef : reconnectRef).current?.focus();
            setReopened(false);
          }}
        />
      ) : null}
    </section>
  );
}

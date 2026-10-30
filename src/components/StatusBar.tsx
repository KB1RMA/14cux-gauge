// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { DotFilledIcon, StopIcon } from '@radix-ui/react-icons';
import { useEffect, useRef, useState } from 'react';
import { connectionHelp } from '../ecu/connectionHelp';
import type { EcuSource } from '../ecu/connect';
import type { ConnectionState } from '../ecu/connectionState';
import { useEcu } from '../ecu/useEcu';
import { useLiveData } from '../ecu/useLiveData';
import { METRICS } from '../metrics';
import { useReadings } from '../readings/useReadings';
import { useScreenWake } from '../screen/useScreenWake';
import type { ScreenWakeStatus } from '../screen/screenWake';
import { useRecording } from '../recording/useRecording';
import { formatDuration, sourceLabel } from '../sessions/format';
import { useSetting } from '../settings/useSetting';
import { FailureDialog } from './FailureDialog';
import styles from './StatusBar.module.css';

type ActiveState = Exclude<ConnectionState, { status: 'idle' }>;

function sourceName(state: ActiveState): string {
  if (state.source.kind === 'demo') {
    return sourceLabel('demo');
  }

  return `${sourceLabel('serial')} (${state.source.doubleSpeed ? '15625' : '7812'} baud)`;
}

/** What to add about the screen, for a connection; nothing if not asked. */
function describeScreen(status: ScreenWakeStatus): string {
  switch (status) {
    case 'on':
      return ' · Screen kept on';
    case 'unsupported':
      return ' · Screen may sleep: this browser cannot keep it on';
    case 'refused':
      return ' · Screen may sleep: the browser refused to keep it on';
    case 'released':
      return ' · Screen may sleep: the browser ended keeping it on';
    case 'inactive':
      return '';
  }
}

function describe(
  state: ActiveState,
  recording: boolean,
  paused: boolean,
  recordingError: string | undefined,
  screen: ScreenWakeStatus,
): string {
  const main = describeConnection(state, recording, paused, recordingError);

  return state.status === 'connected' ? main + describeScreen(screen) : main;
}

function describeConnection(
  state: ActiveState,
  recording: boolean,
  paused: boolean,
  recordingError: string | undefined,
): string {
  switch (state.status) {
    case 'connecting':
      return `Connecting to ${sourceName(state)}…`;

    case 'connected':
      if (paused) {
        return `${sourceName(state)} · Polling paused while the ROM is read`;
      }

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

type SerialSource = Extract<EcuSource, { kind: 'serial' }>;

/** The baud rate `source` did not use, and how to connect at it. */
function otherBaudOffer(
  source: SerialSource,
  connect: (source: SerialSource) => Promise<void>,
) {
  return {
    rate: source.doubleSpeed ? '7812' : '15625',
    connect: () => {
      void connect({ ...source, doubleSpeed: !source.doubleSpeed });
    },
  };
}

export function StatusBar() {
  const { state, connect, disconnect, reconnect, pollingPaused, onAnswered } =
    useEcu();
  const [, setDoubleSpeed] = useSetting('doubleSpeed');
  const { snapshot, stats } = useLiveData();
  const { chosen } = useReadings();
  const recording = useRecording();
  const screenWake = useScreenWake();
  const { active, starting } = recording;
  const reconnectRef = useRef<HTMLButtonElement>(null);
  const detailsRef = useRef<HTMLButtonElement>(null);
  const failed = state.status === 'error';
  // Each failure is a new state object, so the dialog opens once for each
  // until the user closes it; Details opens it again.
  const [closedFor, setClosedFor] = useState<ConnectionState | undefined>(
    undefined,
  );
  const [reopened, setReopened] = useState(false);

  // A baud rate tried from the failure dialog is saved only once the ECU has
  // answered at it, so a failed try cannot replace the right setting.
  useEffect(
    () =>
      onAnswered((source) => {
        if (source.kind === 'serial') {
          setDoubleSpeed(source.doubleSpeed);
        }
      }),
    [onAnswered, setDoubleSpeed],
  );

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
          screenWake,
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
            disabled={!active && !starting && !recording.canRecord}
            // Not `disabled` while starting, which would drop focus from it.
            aria-disabled={starting || undefined}
            onClick={() => {
              if (starting) {
                return;
              }

              void (active ? recording.stop() : recording.start());
            }}
          >
            {active ? (
              <StopIcon aria-hidden="true" />
            ) : (
              <DotFilledIcon aria-hidden="true" className={styles['recDot']} />
            )}
            {active
              ? 'Stop recording'
              : starting
                ? 'Starting recording…'
                : 'Record'}
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
          stage={state.stage}
          otherBaud={
            state.source.kind === 'serial' &&
            state.stage !== undefined &&
            connectionHelp(state.stage).otherBaud
              ? otherBaudOffer(state.source, connect)
              : undefined
          }
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

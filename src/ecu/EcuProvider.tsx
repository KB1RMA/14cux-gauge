// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Ecu } from '@kb1rma/libcomm14cux-ts';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DiagnosticsContext } from '../diagnostics/context';
import { DiagnosticLog, describeRawError } from '../diagnostics/diagnosticLog';
import { pushSnapshot } from '../history/pushSnapshot';
import { SampleHistory } from '../history/sampleHistory';
import { METRIC_KEYS } from '../metrics';
import {
  createEcuConnection,
  type EcuConnection,
  type EcuSource,
} from './connect';
import { connectionReducer } from './connectionState';
import {
  EcuContext,
  HistoryContext,
  LiveDataContext,
  type LiveData,
} from './contexts';
import { describeError } from './errors';
import { startPoller, type LiveSnapshot, type Poller } from './poller';

const NO_LIVE_DATA: LiveData = {
  snapshot: undefined,
  stats: { sampleRateHz: 0 },
};

/** Enough for the longest graph window (10 minutes) at 25 samples a second. */
export const HISTORY_CAPACITY = 15_000;

export interface EcuProviderProps {
  children: ReactNode;
  /** Pause between polling passes for each connection kind, in milliseconds. */
  pollIntervalMs?: Partial<Record<EcuSource['kind'], number>>;
  /** Where serial traffic and connection events are recorded. */
  diagnostics?: DiagnosticLog;
}

function createDefaultLog(): DiagnosticLog {
  if (import.meta.env.MODE === 'test') {
    return new DiagnosticLog();
  }

  // Echo connection events (not bytes) for anyone with the dev tools open.
  return new DiagnosticLog({
    mirror: (entry) => {
      console.info(`[14cux-gauge] ${entry.message}`);
    },
  });
}

interface Session {
  connection: EcuConnection;
  poller?: Poller;
  unwatch?: () => void;
}

export function EcuProvider({
  children,
  pollIntervalMs,
  diagnostics,
}: EcuProviderProps) {
  const [log] = useState(() => diagnostics ?? createDefaultLog());
  const [state, dispatch] = useReducer(connectionReducer, { status: 'idle' });
  const [ecu, setEcu] = useState<Ecu | undefined>(undefined);
  const [liveData, setLiveData] = useState<LiveData>(NO_LIVE_DATA);
  const [history] = useState(
    () => new SampleHistory(METRIC_KEYS, HISTORY_CAPACITY),
  );
  const [snapshotListeners] = useState(
    () => new Set<(snapshot: LiveSnapshot) => void>(),
  );
  const sessionRef = useRef<Session | undefined>(undefined);
  // Bumped by every connect/disconnect, so a slow async step can tell that it
  // has been superseded.
  const generationRef = useRef(0);
  const serialInterval = pollIntervalMs?.serial ?? 0;
  // The simulated ECU answers instantly; without a pause it would spin.
  const demoInterval = pollIntervalMs?.demo ?? 100;

  const teardown = useCallback(async () => {
    const current = sessionRef.current;

    sessionRef.current = undefined;
    setEcu(undefined);
    setLiveData(NO_LIVE_DATA);

    if (current) {
      current.unwatch?.();
      current.poller?.stop();
      await current.connection.dispose();
    }
  }, []);

  const fail = useCallback(
    async (forGeneration: number, error: unknown) => {
      if (forGeneration !== generationRef.current) {
        return;
      }

      log.record('error', `Connection failed: ${describeRawError(error)}`);
      await teardown();
      dispatch({ type: 'failed', message: describeError(error) });
    },
    [teardown, log],
  );

  const connect = useCallback(
    async (source: EcuSource) => {
      const myGeneration = ++generationRef.current;

      await teardown();
      history.clear();
      dispatch({ type: 'connect', source });
      log.record(
        'event',
        source.kind === 'demo'
          ? 'Connecting to the demo ECU'
          : `Connecting to a serial ECU${source.doubleSpeed ? ' (double-speed firmware)' : ''}`,
      );

      const connection = createEcuConnection(source, log);

      sessionRef.current = { connection };

      try {
        await connection.ecu.connect();
      } catch (error) {
        await fail(myGeneration, error);

        return;
      }

      if (myGeneration !== generationRef.current) {
        return;
      }

      sessionRef.current.unwatch = connection.onLost(() => {
        log.record('event', 'The browser reported the port disconnected');
        void fail(
          myGeneration,
          new DOMException('The serial port was disconnected.', 'NetworkError'),
        );
      });
      sessionRef.current.poller = startPoller(connection.ecu, {
        intervalMs: source.kind === 'demo' ? demoInterval : serialInterval,
        onSnapshot: (snapshot, stats) => {
          pushSnapshot(history, snapshot);

          for (const listener of snapshotListeners) {
            listener(snapshot);
          }

          setLiveData({ snapshot, stats });
        },
        onError: (error) => {
          void fail(myGeneration, error);
        },
        onRetry: (error, consecutiveErrors) => {
          log.record(
            'error',
            `Polling pass failed (${String(consecutiveErrors)} in a row), retrying: ${describeRawError(error)}`,
          );
        },
      });
      setEcu(connection.ecu);
      dispatch({ type: 'connected' });
      log.record('event', 'Connected; polling live data');
    },
    [
      teardown,
      fail,
      history,
      snapshotListeners,
      demoInterval,
      serialInterval,
      log,
    ],
  );

  const disconnect = useCallback(async () => {
    generationRef.current++;
    log.record('event', 'Disconnecting at the user’s request');
    await teardown();
    dispatch({ type: 'disconnected' });
  }, [teardown, log]);

  const reconnect = useCallback(async () => {
    if (state.status !== 'idle') {
      await connect(state.source);
    }
  }, [state, connect]);

  const onSnapshot = useCallback(
    (listener: (snapshot: LiveSnapshot) => void) => {
      snapshotListeners.add(listener);

      return () => {
        snapshotListeners.delete(listener);
      };
    },
    [snapshotListeners],
  );

  useEffect(
    () => () => {
      generationRef.current++;
      void teardown();
    },
    [teardown],
  );

  const value = useMemo(
    () => ({ state, ecu, connect, disconnect, reconnect, onSnapshot }),
    [state, ecu, connect, disconnect, reconnect, onSnapshot],
  );

  return (
    <DiagnosticsContext value={log}>
      <EcuContext value={value}>
        <LiveDataContext value={liveData}>
          <HistoryContext value={history}>{children}</HistoryContext>
        </LiveDataContext>
      </EcuContext>
    </DiagnosticsContext>
  );
}

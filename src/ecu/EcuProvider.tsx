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
import {
  DiagnosticLog,
  consoleMirror,
  describeRawError,
} from '../diagnostics/diagnosticLog';
import { pushSnapshot } from '../history/pushSnapshot';
import { SampleHistory } from '../history/sampleHistory';
import { METRIC_KEYS, readingsFor, type MetricKey } from '../metrics';
import { ReadingsContext } from '../readings/context';
import {
  ALWAYS_READ,
  chosenReadings,
  parseReadingSettings,
  READINGS_KEY,
} from '../readings/readingSettings';
import { useStoredState } from '../storage/useStoredState';
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
import { describeError, errorReason } from './errors';
import {
  pickReadings,
  startPoller,
  type LiveSnapshot,
  type Poller,
} from './poller';

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
  // Echo connection events (not bytes) to the console, except in unit tests.
  return new DiagnosticLog(
    import.meta.env.MODE === 'test' ? {} : { mirror: consoleMirror },
  );
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
  const [readingSettings, setReadingSettings] = useStoredState(
    READINGS_KEY,
    parseReadingSettings,
  );
  // How many views have asked for each reading (see `request`).
  const [requested, setRequested] = useState<ReadonlyMap<MetricKey, number>>(
    () => new Map(),
  );
  const chosen = useMemo(
    () => chosenReadings(readingSettings.off),
    [readingSettings.off],
  );
  // What the poller reads: the chosen readings and any a view has asked
  // for. Only the chosen ones are recorded, and only those the user picked
  // (not `ALWAYS_READ`) decide whether slow values can wait.
  const polling = useMemo(
    () => ({
      polled: readingsFor([...chosen, ...requested.keys()]),
      chosen: readingsFor(chosen),
      watched: readingsFor(chosen.filter((key) => !ALWAYS_READ.includes(key))),
    }),
    [chosen, requested],
  );
  // The poller asks before every pass, so a change applies without
  // reconnecting.
  const pollingRef = useRef(polling);
  const sessionRef = useRef<Session | undefined>(undefined);
  // Bumped by every connect/disconnect, so a slow async step can tell that it
  // has been superseded.
  const generationRef = useRef(0);
  const serialInterval = pollIntervalMs?.serial ?? 0;
  // The demo's simulated link takes time per read, like a real one, so it
  // polls flat out too and reading fewer values is faster.
  const demoInterval = pollIntervalMs?.demo ?? 0;

  // Settles once every connection torn down so far has been disposed, so a
  // new connection never opens the port while the last one still holds it.
  const disposedRef = useRef<Promise<void>>(Promise.resolve());

  const teardown = useCallback(async () => {
    const current = sessionRef.current;

    sessionRef.current = undefined;
    setEcu(undefined);
    setLiveData(NO_LIVE_DATA);

    if (current) {
      current.unwatch?.();
      current.poller?.stop();
      // A failed dispose has nothing to recover, and must not block the
      // next connection.
      disposedRef.current = disposedRef.current
        .then(() => current.connection.dispose())
        .catch(() => undefined);
    }

    await disposedRef.current;
  }, []);

  const fail = useCallback(
    async (forGeneration: number, error: unknown) => {
      if (forGeneration !== generationRef.current) {
        return;
      }

      const detail = describeRawError(error);

      log.record('error', `Connection failed: ${detail}`);
      await teardown();

      // A connection started while this one was closing takes precedence.
      if (forGeneration !== generationRef.current) {
        return;
      }

      dispatch({
        type: 'failed',
        message: describeError(error),
        detail,
        reason: errorReason(error),
      });
    },
    [teardown, log],
  );

  const connect = useCallback(
    async (source: EcuSource) => {
      const myGeneration = ++generationRef.current;

      await teardown();

      // Another connect or a disconnect came while the last one was closing.
      if (myGeneration !== generationRef.current) {
        return;
      }

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
        readings: () => pollingRef.current.polled,
        watched: () => pollingRef.current.watched,
        onSnapshot: (snapshot, stats) => {
          pushSnapshot(history, snapshot);

          if (snapshotListeners.size > 0) {
            const chosenOnly = pickReadings(
              snapshot,
              pollingRef.current.chosen,
            );

            for (const listener of snapshotListeners) {
              listener(chosenOnly);
            }
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
    const myGeneration = ++generationRef.current;

    log.record('event', 'Disconnecting at the user’s request');
    await teardown();

    // A connection started while this one was closing takes precedence.
    if (myGeneration === generationRef.current) {
      dispatch({ type: 'disconnected' });
    }
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

  useEffect(() => {
    pollingRef.current = polling;
  }, [polling]);

  const setOff = useCallback(
    (off: MetricKey[]) => {
      setReadingSettings({ off });
    },
    [setReadingSettings],
  );

  const request = useCallback((keys: readonly MetricKey[]) => {
    const change = (by: number) => {
      setRequested((previous) => {
        const next = new Map(previous);

        for (const key of keys) {
          const count = (next.get(key) ?? 0) + by;

          if (count > 0) {
            next.set(key, count);
          } else {
            next.delete(key);
          }
        }

        return next;
      });
    };

    change(1);

    return () => {
      change(-1);
    };
  }, []);

  const readings = useMemo(
    () => ({ chosen, off: readingSettings.off, setOff, request }),
    [chosen, readingSettings.off, setOff, request],
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
          <HistoryContext value={history}>
            <ReadingsContext value={readings}>{children}</ReadingsContext>
          </HistoryContext>
        </LiveDataContext>
      </EcuContext>
    </DiagnosticsContext>
  );
}

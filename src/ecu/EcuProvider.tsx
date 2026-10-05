// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Ecu } from 'comm14cux-ts';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createEcuConnection,
  type EcuConnection,
  type EcuSource,
} from './connect';
import { connectionReducer } from './connectionState';
import { EcuContext, LiveDataContext, type LiveData } from './contexts';
import { describeError } from './errors';
import { startPoller, type Poller } from './poller';

const NO_LIVE_DATA: LiveData = {
  snapshot: undefined,
  stats: { sampleRateHz: 0 },
};

export interface EcuProviderProps {
  children: ReactNode;
  /** Pause between polling passes for each connection kind, in milliseconds. */
  pollIntervalMs?: Partial<Record<EcuSource['kind'], number>>;
}

interface Session {
  connection: EcuConnection;
  poller?: Poller;
  unwatch?: () => void;
}

export function EcuProvider({ children, pollIntervalMs }: EcuProviderProps) {
  const [state, dispatch] = useReducer(connectionReducer, { status: 'idle' });
  const [ecu, setEcu] = useState<Ecu | undefined>(undefined);
  const [liveData, setLiveData] = useState<LiveData>(NO_LIVE_DATA);
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

      await teardown();
      dispatch({ type: 'failed', message: describeError(error) });
    },
    [teardown],
  );

  const connect = useCallback(
    async (source: EcuSource) => {
      const myGeneration = ++generationRef.current;

      await teardown();
      dispatch({ type: 'connect', source });

      const connection = createEcuConnection(source);

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
        void fail(
          myGeneration,
          new DOMException('The serial port was disconnected.', 'NetworkError'),
        );
      });
      sessionRef.current.poller = startPoller(connection.ecu, {
        intervalMs: source.kind === 'demo' ? demoInterval : serialInterval,
        onSnapshot: (snapshot, stats) => {
          setLiveData({ snapshot, stats });
        },
        onError: (error) => {
          void fail(myGeneration, error);
        },
      });
      setEcu(connection.ecu);
      dispatch({ type: 'connected' });
    },
    [teardown, fail, demoInterval, serialInterval],
  );

  const disconnect = useCallback(async () => {
    generationRef.current++;
    await teardown();
    dispatch({ type: 'disconnected' });
  }, [teardown]);

  const reconnect = useCallback(async () => {
    if (state.status !== 'idle') {
      await connect(state.source);
    }
  }, [state, connect]);

  useEffect(
    () => () => {
      generationRef.current++;
      void teardown();
    },
    [teardown],
  );

  const value = useMemo(
    () => ({ state, ecu, connect, disconnect, reconnect }),
    [state, ecu, connect, disconnect, reconnect],
  );

  return (
    <EcuContext value={value}>
      <LiveDataContext value={liveData}>{children}</LiveDataContext>
    </EcuContext>
  );
}

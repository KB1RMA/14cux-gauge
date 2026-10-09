// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { recordedSource } from '../ecu/connect';
import { useEcu } from '../ecu/useEcu';
import { useEcuWrite } from '../ecuWrite/useEcuWrite';
import { defaultSessionName, describeStorageError } from '../sessions/format';
import type { SessionSummary } from '../model/session';
import { useStorage } from '../storage/useStorage';
import { RecordingContext } from './context';
import { SessionRecorder } from './sessionRecorder';

interface Active {
  recorder: SessionRecorder;
  unsubscribe(): void;
}

/**
 * Records the live snapshots, and the writes to the ECU, into a session
 * while the user asks it to. Recording stops by itself when the connection
 * ends, keeping what was recorded, or if saving fails.
 */
export function RecordingProvider({ children }: { children: ReactNode }) {
  const { state, onSnapshot } = useEcu();
  const { watch } = useEcuWrite();
  const store = useStorage()?.sessions;
  const [active, setActive] = useState<SessionSummary | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [finished, setFinished] = useState<SessionSummary | undefined>(
    undefined,
  );
  const activeRef = useRef<Active | undefined>(undefined);
  const startingRef = useRef(false);
  const connected = state.status === 'connected';
  const source =
    state.status === 'idle' ? undefined : recordedSource(state.source);
  const canRecord = connected && store !== undefined;

  /** Stops recording; resolves with the finished session, if there was one. */
  const finish = useCallback(async () => {
    const current = activeRef.current;

    if (!current) {
      return undefined;
    }

    activeRef.current = undefined;
    current.unsubscribe();
    setActive(undefined);

    return current.recorder.stop();
  }, []);

  const stop = useCallback(async () => {
    try {
      setFinished(await finish());
    } catch (cause) {
      setError(describeStorageError(cause));
    }
  }, [finish]);

  const interrupt = useCallback(async () => {
    try {
      await finish();
    } catch (cause) {
      setError(describeStorageError(cause));
    }
  }, [finish]);

  const dismissFinished = useCallback(() => {
    setFinished(undefined);
  }, []);

  // Stopping by itself, the recording keeps what it has; a failure here has
  // already been reported through the recorder's onError.
  const stopQuietly = useCallback(() => {
    void finish().catch(() => undefined);
  }, [finish]);

  const start = useCallback(async () => {
    if (!canRecord || !source || activeRef.current || startingRef.current) {
      return;
    }

    startingRef.current = true;
    setError(undefined);

    try {
      const startedAt = Date.now();
      const recorder = await SessionRecorder.start(
        store,
        { name: defaultSessionName(source, startedAt), source, startedAt },
        {
          onError: (cause) => {
            setError(describeStorageError(cause));
            stopQuietly();
          },
        },
      );

      const stopSamples = onSnapshot((snapshot) => {
        recorder.push(snapshot);
      });
      const stopWrites = watch((entry) => {
        recorder.recordWrite(entry);
      });

      activeRef.current = {
        recorder,
        unsubscribe: () => {
          stopSamples();
          stopWrites();
        },
      };
      setActive(recorder.session);
    } catch (cause) {
      setError(describeStorageError(cause));
    } finally {
      startingRef.current = false;
    }
  }, [canRecord, source, store, onSnapshot, watch, stopQuietly]);

  // Keep what was recorded when the connection ends, including when it
  // ended while recording was starting.
  useEffect(() => {
    if (!connected && active) {
      stopQuietly();
    }
  }, [connected, active, stopQuietly]);

  useEffect(() => stopQuietly, [stopQuietly]);

  const value = useMemo(
    () => ({
      active,
      canRecord,
      error,
      finished,
      start,
      stop,
      dismissFinished,
      interrupt,
    }),
    [
      active,
      canRecord,
      error,
      finished,
      start,
      stop,
      dismissFinished,
      interrupt,
    ],
  );

  return <RecordingContext value={value}>{children}</RecordingContext>;
}

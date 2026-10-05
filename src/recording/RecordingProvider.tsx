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
import { useEcu } from '../ecu/useEcu';
import { defaultSessionName, describeStorageError } from '../sessions/format';
import { useSessions } from '../sessions/useSessions';
import type { SessionSummary } from '../storage/sessionStore';
import { RecordingContext } from './context';
import { SessionRecorder } from './sessionRecorder';

interface Active {
  recorder: SessionRecorder;
  unsubscribe(): void;
}

/**
 * Records the live snapshots into a session while the user asks it to.
 * Recording stops by itself when the connection ends, keeping what was
 * recorded, or if a write fails.
 */
export function RecordingProvider({ children }: { children: ReactNode }) {
  const { state, onSnapshot } = useEcu();
  const { store } = useSessions();
  const [active, setActive] = useState<SessionSummary | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [finished, setFinished] = useState<SessionSummary | undefined>(
    undefined,
  );
  const activeRef = useRef<Active | undefined>(undefined);
  const startingRef = useRef(false);
  const connected = state.status === 'connected';
  const source = state.status === 'idle' ? undefined : state.source.kind;
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

      activeRef.current = {
        recorder,
        unsubscribe: onSnapshot((snapshot) => {
          recorder.push(snapshot);
        }),
      };
      setActive(recorder.session);
    } catch (cause) {
      setError(describeStorageError(cause));
    } finally {
      startingRef.current = false;
    }
  }, [canRecord, source, store, onSnapshot, stopQuietly]);

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
    }),
    [active, canRecord, error, finished, start, stop, dismissFinished],
  );

  return <RecordingContext value={value}>{children}</RecordingContext>;
}

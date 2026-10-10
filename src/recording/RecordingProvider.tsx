// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useServices } from '../services/useServices';
import { RecordingContext, type RecordingValue } from './context';

/** Exposes `Recorder` to the views. */
export function RecordingProvider({ children }: { children: ReactNode }) {
  const { recorder } = useServices();
  const state = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot);

  const value = useMemo<RecordingValue>(
    () => ({
      ...state,
      start: recorder.start,
      stop: recorder.stop,
      dismissFinished: recorder.dismissFinished,
    }),
    [state, recorder],
  );

  return <RecordingContext value={value}>{children}</RecordingContext>;
}

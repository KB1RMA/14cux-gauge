// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use, useSyncExternalStore } from 'react';
import { HistoryContext } from '../ecu/contexts';
import type { MetricKey } from '../metrics';
import type { SampleHistory } from './sampleHistory';

/**
 * The sample history, and its version: the caller re-renders whenever a
 * sample is added or the history is cleared.
 */
export function useHistory(): {
  history: SampleHistory<MetricKey>;
  version: number;
} {
  const history = use(HistoryContext);

  if (!history) {
    throw new Error('useHistory must be used inside <EcuProvider>');
  }

  const version = useSyncExternalStore(history.subscribe, history.getVersion);

  return { history, version };
}

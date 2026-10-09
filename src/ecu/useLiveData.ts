// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useSyncExternalStore } from 'react';
import { sampleOf, type MetricKey } from '../metrics';
import type { LiveSnapshot } from '../model/snapshot';
import type { LiveData } from './session';
import { useEcuSession } from './useEcuSession';

/**
 * The latest snapshot from the poller, and its measured sample rate. The
 * caller re-renders on every pass; prefer `useLiveSelect` for one value.
 */
export function useLiveData(): LiveData {
  const session = useEcuSession();

  return useSyncExternalStore(session.subscribeLive, session.getLive);
}

/**
 * What `select` picks from the latest snapshot (`undefined` before the first
 * pass and while polling is paused). The caller re-renders only when that
 * changes, so `select` must return a primitive or an unchanging object.
 */
export function useLiveSelect<T>(
  select: (snapshot: LiveSnapshot | undefined) => T,
): T {
  const session = useEcuSession();

  return useSyncExternalStore(session.subscribeLive, () =>
    select(session.getLive().snapshot),
  );
}

/**
 * A metric's latest sample, in library units: `null` if invalid, and
 * `undefined` when there is no reading.
 */
export function useLiveSample(key: MetricKey): number | null | undefined {
  return useLiveSelect((snapshot) =>
    snapshot ? sampleOf(snapshot, key) : undefined,
  );
}

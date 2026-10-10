// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { LiveSnapshot } from '../model/snapshot';
import { METRIC_KEYS, sampleOf, type MetricKey } from '../metrics';
import { SampleHistory } from './sampleHistory';

/** Adds every metric of `snapshot` to `history`, at the snapshot's time. */
export function pushSnapshot(
  history: SampleHistory<MetricKey>,
  snapshot: LiveSnapshot,
): void {
  history.push(
    snapshot.timestamp,
    Object.fromEntries(
      METRIC_KEYS.map((key) => [key, sampleOf(snapshot, key)]),
    ),
  );
}

/**
 * A history holding every one of `snapshots` (oldest first), so a recording
 * is drawn from the same series model as the live session.
 */
export function historyOf(
  snapshots: readonly LiveSnapshot[],
): SampleHistory<MetricKey> {
  const size = Math.max(snapshots.length, 1);
  const history = new SampleHistory<MetricKey>(METRIC_KEYS, size, size);

  for (const snapshot of snapshots) {
    pushSnapshot(history, snapshot);
  }

  return history;
}

// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { LiveSnapshot } from '../ecu/poller';
import { METRIC_KEYS, sampleOf, type MetricKey } from '../metrics';
import type { SampleHistory } from './sampleHistory';

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

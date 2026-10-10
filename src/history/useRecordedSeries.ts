// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useState } from 'react';
import type { LiveSnapshot } from '../model/snapshot';
import type { MetricKey } from '../metrics';
import { historyOf } from './pushSnapshot';
import type { ReadonlySeries } from './sampleHistory';

/**
 * A recording's samples as the series the graphs read, built once. As with
 * `useReplay`, `samples` must not change: key the caller by session instead.
 */
export function useRecordedSeries(
  samples: readonly LiveSnapshot[],
): ReadonlySeries<MetricKey> {
  const [series] = useState(() => historyOf(samples));

  return series;
}

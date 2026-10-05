// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { WINDOW_OPTIONS } from '../components/graphSettings';
import { HISTORY_CAPACITY } from '../ecu/EcuProvider';
import type { LiveSnapshot } from '../ecu/poller';
import { pushSnapshot } from '../history/pushSnapshot';
import { SampleHistory } from '../history/sampleHistory';
import { METRIC_KEYS, type MetricKey } from '../metrics';

/** The longest time window a graph can show, in milliseconds. */
const LONGEST_WINDOW_MS =
  Math.max(...WINDOW_OPTIONS.map((option) => option.seconds)) * 1000;

/** How many of `samples` (oldest first) pass `before`, by binary search. */
function countWhile(
  samples: readonly LiveSnapshot[],
  before: (timestamp: number) => boolean,
): number {
  let low = 0;
  let high = samples.length;

  while (low < high) {
    const mid = (low + high) >>> 1;

    if (before(samples[mid]?.timestamp ?? 0)) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

/** How many of `samples` (oldest first) were taken at or before `time`. */
export function countUpTo(
  samples: readonly LiveSnapshot[],
  time: number,
): number {
  return countWhile(samples, (timestamp) => timestamp <= time);
}

/**
 * Plays recorded samples into a {@link SampleHistory}, so the live graphs
 * can draw a recording as if it were arriving now.
 *
 * Moving forward a little adds just the new samples, as live polling would.
 * Any other move rebuilds the history from the samples the longest graph
 * window can show, so a seek costs the same wherever it lands.
 */
export class ReplayHistory {
  readonly history: SampleHistory<MetricKey>;
  private shown = 0;

  constructor(
    private readonly samples: readonly LiveSnapshot[],
    capacity = HISTORY_CAPACITY,
  ) {
    this.history = new SampleHistory(METRIC_KEYS, capacity);
  }

  /** How many samples, from the first, the history holds up to. */
  get shownCount(): number {
    return this.shown;
  }

  /** Makes the first `count` samples the history, newest last. */
  show(count: number): void {
    const target = Math.min(Math.max(0, count), this.samples.length);

    if (target === this.shown) {
      return;
    }

    if (target > this.shown && target - this.shown <= this.history.capacity) {
      this.push(this.shown, target);
    } else {
      const newest = this.samples[target - 1]?.timestamp ?? 0;
      const from = Math.max(
        countWhile(this.samples, (t) => t < newest - LONGEST_WINDOW_MS),
        target - this.history.capacity,
      );

      this.history.clear();
      this.push(from, target);
    }

    this.shown = target;
  }

  private push(from: number, to: number): void {
    for (let i = from; i < to; i++) {
      const sample = this.samples[i];

      if (sample) {
        pushSnapshot(this.history, sample);
      }
    }
  }
}

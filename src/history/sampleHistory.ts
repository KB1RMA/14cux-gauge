// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors

/** Samples for one series over a time window, oldest first. */
export interface SeriesWindow {
  /** `Date.now()`-style milliseconds. */
  times: number[];
  /** `null` where the reading was invalid. */
  values: (number | null)[];
}

/**
 * A fixed-size, in-memory ring buffer of recent samples, one column per
 * series, so the graphs can show the last few minutes without the memory
 * use growing over a long session. When full, the oldest samples are
 * overwritten.
 *
 * It is an external store for `useSyncExternalStore`: `subscribe` and
 * `getVersion` are bound, and the version changes on every push or clear.
 */
export class SampleHistory<K extends string> {
  readonly capacity: number;
  private readonly times: Float64Array;
  // NaN marks an invalid reading; it never occurs in a real sample.
  private readonly columns: ReadonlyMap<K, Float64Array>;
  private readonly listeners = new Set<() => void>();
  private start = 0;
  private count = 0;
  private version = 0;

  constructor(keys: readonly K[], capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('capacity must be a positive integer');
    }

    this.capacity = capacity;
    this.times = new Float64Array(capacity);
    this.columns = new Map(
      keys.map((key) => [key, new Float64Array(capacity)] as const),
    );
  }

  /** Number of samples held. */
  get size(): number {
    return this.count;
  }

  /** Time of the newest sample, or `undefined` if empty. */
  get latestTime(): number | undefined {
    return this.count === 0 ? undefined : this.times[this.slot(this.count - 1)];
  }

  /**
   * Adds one sample per series, taken at `time`. Series missing from
   * `values` are recorded as invalid. A time earlier than the newest sample
   * (the wall clock was set back) is recorded at the newest sample's time,
   * so the buffer stays in order.
   */
  push(time: number, values: Partial<Record<K, number | null>>): void {
    const at = Math.max(time, this.latestTime ?? -Infinity);
    const index =
      this.count < this.capacity
        ? this.slot(this.count++)
        : this.advanceStart();

    this.times[index] = at;

    for (const [key, column] of this.columns) {
      column[index] = values[key] ?? Number.NaN;
    }

    this.changed();
  }

  clear(): void {
    if (this.count === 0) {
      return;
    }

    this.start = 0;
    this.count = 0;
    this.changed();
  }

  /** The samples of `key` taken at or after `since`, oldest first. */
  window(key: K, since = -Infinity): SeriesWindow {
    const column = this.columns.get(key);
    const times: number[] = [];
    const values: (number | null)[] = [];

    if (!column) {
      return { times, values };
    }

    for (let i = this.firstAtOrAfter(since); i < this.count; i++) {
      const index = this.slot(i);
      const value = column[index] ?? Number.NaN;

      times.push(this.times[index] ?? 0);
      values.push(Number.isNaN(value) ? null : value);
    }

    return { times, values };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getVersion = (): number => this.version;

  /** Buffer index of the `i`th oldest sample. */
  private slot(i: number): number {
    return (this.start + i) % this.capacity;
  }

  /** Drops the oldest sample and returns its slot for reuse. */
  private advanceStart(): number {
    const index = this.start;

    this.start = (this.start + 1) % this.capacity;

    return index;
  }

  /** Logical index of the first sample at or after `time` (binary search). */
  private firstAtOrAfter(time: number): number {
    let low = 0;
    let high = this.count;

    while (low < high) {
      const mid = (low + high) >>> 1;

      if ((this.times[this.slot(mid)] ?? 0) < time) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low;
  }

  private changed(): void {
    this.version++;

    for (const listener of this.listeners) {
      listener();
    }
  }
}

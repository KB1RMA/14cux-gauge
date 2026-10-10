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
 * What the graphs read: samples of several series on one time base, oldest
 * first, whether they were taken live or loaded from a recording. Values are
 * in the library's units at full precision, and `null` marks a reading that
 * is missing or invalid, which is a gap and never a value.
 */
export interface ReadonlySeries<K extends string> {
  /** Number of samples held. */
  readonly size: number;
  /** Time of the oldest sample, or `undefined` if empty. */
  readonly earliestTime: number | undefined;
  /** Time of the newest sample, or `undefined` if empty. */
  readonly latestTime: number | undefined;
  /** The samples of `key` from `since` to `until` inclusive. */
  window(key: K, since?: number, until?: number): SeriesWindow;
  /**
   * The samples of `key` from `since` to `until` inclusive, thinned for
   * drawing in buckets `bucketMs` wide: every extreme is kept and every gap
   * stays a gap. With `edges`, the sample just outside each end is kept too,
   * so a line runs to the edges of the window.
   */
  thinned(
    key: K,
    since: number,
    bucketMs: number,
    until?: number,
    edges?: boolean,
  ): SeriesWindow;
  /**
   * The last sample of `key` at or before `time`: `null` if it was invalid,
   * `undefined` if there is none yet.
   */
  valueAt(key: K, time: number): number | null | undefined;
}

/**
 * An in-memory ring buffer of recent samples, one column per series, so the
 * graphs can show the session without the memory use growing without limit.
 * It grows as samples arrive, up to `capacity`; once full, the oldest
 * samples are overwritten.
 *
 * It is an external store for `useSyncExternalStore`: `subscribe` and
 * `getVersion` are bound, and the version changes on every push or clear.
 */
/** Samples held before the buffers first grow. */
const INITIAL_LENGTH = 1024;

export class SampleHistory<K extends string> implements ReadonlySeries<K> {
  readonly capacity: number;
  private times: Float64Array;
  // NaN marks an invalid reading; it never occurs in a real sample.
  private columns: Map<K, Float64Array>;
  private readonly listeners = new Set<() => void>();
  private start = 0;
  private count = 0;
  private dropped = false;
  private version = 0;

  constructor(keys: readonly K[], capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('capacity must be a positive integer');
    }

    this.capacity = capacity;

    const length = Math.min(capacity, INITIAL_LENGTH);

    this.times = new Float64Array(length);
    this.columns = new Map(
      keys.map((key) => [key, new Float64Array(length)] as const),
    );
  }

  /** Number of samples held. */
  get size(): number {
    return this.count;
  }

  /** Whether samples have been overwritten since the history was cleared. */
  get truncated(): boolean {
    return this.dropped;
  }

  /** Time of the oldest sample held, or `undefined` if empty. */
  get earliestTime(): number | undefined {
    return this.count === 0 ? undefined : this.times[this.slot(0)];
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

    if (this.count === this.times.length && this.count < this.capacity) {
      this.grow();
    }

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
    this.dropped = false;
    this.changed();
  }

  /** The samples of `key` from `since` to `until` inclusive, oldest first. */
  window(key: K, since = -Infinity, until = Infinity): SeriesWindow {
    const column = this.columns.get(key);
    const times: number[] = [];
    const values: (number | null)[] = [];

    if (!column) {
      return { times, values };
    }

    const end = this.firstAfter(until);

    for (let i = this.firstAtOrAfter(since); i < end; i++) {
      const index = this.slot(i);
      const value = column[index] ?? Number.NaN;

      times.push(this.times[index] ?? 0);
      values.push(Number.isNaN(value) ? null : value);
    }

    return { times, values };
  }

  /**
   * The samples of `key` from `since` to `until` inclusive, thinned for
   * drawing. Samples are grouped into buckets `bucketMs` wide, aligned to multiples
   * of it so a bucket keeps the same samples as the window scrolls. Each run
   * of valid samples in a bucket keeps only its first, lowest, highest and
   * last sample, in time order, so every point is a real sample and no
   * extreme is lost. Each run of invalid samples becomes one `null`, so gaps
   * stay gaps. With `edges`, the sample just outside each end is kept as
   * well (thinned with the rest), so a line runs to the edges of the window.
   */
  thinned(
    key: K,
    since: number,
    bucketMs: number,
    until = Infinity,
    edges = false,
  ): SeriesWindow {
    const column = this.columns.get(key);
    const times: number[] = [];
    const values: (number | null)[] = [];

    if (!column) {
      return { times, values };
    }

    // Logical indexes of the current run's first, lowest, highest and last
    // samples; -1 when there is no run.
    let first = -1;
    let low = -1;
    let high = -1;
    let last = -1;
    let bucket = Number.NaN;
    let inGap = false;
    const value = (i: number) => column[this.slot(i)] ?? Number.NaN;

    const flush = () => {
      if (first < 0) {
        return;
      }

      const kept = [...new Set([first, low, high, last])].sort((a, b) => a - b);

      for (const i of kept) {
        times.push(this.times[this.slot(i)] ?? 0);
        values.push(value(i));
      }

      first = -1;
    };

    const margin = edges ? 1 : 0;
    const end = Math.min(this.firstAfter(until) + margin, this.count);

    for (
      let i = Math.max(this.firstAtOrAfter(since) - margin, 0);
      i < end;
      i++
    ) {
      const time = this.times[this.slot(i)] ?? 0;
      const v = value(i);
      const b = Math.floor(time / bucketMs);

      if (b !== bucket) {
        flush();
        bucket = b;
      }

      if (Number.isNaN(v)) {
        flush();

        if (!inGap) {
          times.push(time);
          values.push(null);
          inGap = true;
        }
      } else if (first < 0) {
        first = low = high = last = i;
        inGap = false;
      } else {
        if (v < value(low)) {
          low = i;
        }

        if (v > value(high)) {
          high = i;
        }

        last = i;
      }
    }

    flush();

    return { times, values };
  }

  valueAt(key: K, time: number): number | null | undefined {
    const column = this.columns.get(key);
    const i = this.firstAfter(time) - 1;

    if (!column || i < 0) {
      return undefined;
    }

    const value = column[this.slot(i)] ?? Number.NaN;

    return Number.isNaN(value) ? null : value;
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

  /**
   * Doubles the buffers, up to `capacity`. Only called before the buffer
   * first fills, so the samples start at slot 0 and copy across unchanged.
   */
  private grow(): void {
    const length = Math.min(this.capacity, this.times.length * 2);
    const times = new Float64Array(length);

    times.set(this.times);
    this.times = times;

    for (const [key, column] of this.columns) {
      const grown = new Float64Array(length);

      grown.set(column);
      this.columns.set(key, grown);
    }
  }

  /** Drops the oldest sample and returns its slot for reuse. */
  private advanceStart(): number {
    const index = this.start;

    this.dropped = true;
    this.start = (this.start + 1) % this.capacity;

    return index;
  }

  /** Logical index of the first sample at or after `time` (binary search). */
  private firstAtOrAfter(time: number): number {
    return this.countWhile((t) => t < time);
  }

  /** Logical index of the first sample after `time`. */
  private firstAfter(time: number): number {
    return this.countWhile((t) => t <= time);
  }

  /** How many of the oldest samples' times pass `before` (binary search). */
  private countWhile(before: (time: number) => boolean): number {
    let low = 0;
    let high = this.count;

    while (low < high) {
      const mid = (low + high) >>> 1;

      if (before(this.times[this.slot(mid)] ?? 0)) {
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

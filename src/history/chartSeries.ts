// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { ReadonlySeries } from './sampleHistory';

/** Times (seconds) and values ready for a chart; `null` is a gap. */
export type ChartData = [times: number[], values: (number | null)[]];

/**
 * The bucket width for drawing `spanMs` of samples in about `buckets`
 * buckets. A power of two, so the width changes rarely as a span grows or
 * is zoomed, and a bucket keeps the same samples as the window moves.
 */
export function bucketWidth(spanMs: number, buckets: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(spanMs, 1) / Math.max(buckets, 1)));
}

/**
 * One series of `series` from `since` to `until` (milliseconds) as chart
 * data: thinned keeping every extreme and gap, with times in seconds from
 * `origin` (milliseconds) and values passed through `convert`, which is
 * for display units only. Live graphs and replay both draw through this, so
 * the same samples read the same in both.
 */
export function chartData<K extends string>(
  series: ReadonlySeries<K>,
  key: K,
  window: {
    since: number;
    until?: number;
    origin: number;
    buckets: number;
    edges?: boolean;
  },
  convert: (value: number) => number,
): ChartData {
  const { since, until = Infinity, origin, buckets, edges = false } = window;
  const span =
    Math.min(until, series.latestTime ?? 0) -
    Math.max(since, series.earliestTime ?? 0);
  const { times, values } = series.thinned(
    key,
    since,
    bucketWidth(span, buckets),
    until,
    edges,
  );

  return [
    times.map((time) => (time - origin) / 1000),
    values.map((value) => (value === null ? null : convert(value))),
  ];
}

/**
 * The lowest and highest valid values of one series from `since` to
 * `until`, passed through `convert`, or `undefined` if there are none.
 * Thinning keeps every extreme, so these are exact.
 */
export function extremesOf<K extends string>(
  series: ReadonlySeries<K>,
  key: K,
  window: { since: number; until?: number; buckets: number },
  convert: (value: number) => number,
): { min: number | undefined; max: number | undefined } {
  const [, values] = chartData(series, key, { ...window, origin: 0 }, convert);

  return extremes(values);
}

/** The lowest and highest valid values, or `undefined` if there are none. */
export function extremes(values: readonly (number | null)[]): {
  min: number | undefined;
  max: number | undefined;
} {
  let min: number | undefined;
  let max: number | undefined;

  for (const value of values) {
    if (value !== null) {
      min = min === undefined ? value : Math.min(min, value);
      max = max === undefined ? value : Math.max(max, value);
    }
  }

  return { min, max };
}

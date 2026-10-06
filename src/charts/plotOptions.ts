// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type uPlot from 'uplot';
import type { Metric } from '../metrics';
import { formatDuration } from '../sessions/format';

/**
 * uPlot options for one metric's live graph. The x axis is seconds relative
 * to the newest sample (−60 … 0), so the graph scrolls as samples arrive.
 * Colours come from the theme's custom properties each time the chart
 * draws, so it follows light and dark themes without being rebuilt.
 *
 * uPlot itself is loaded on demand ({@link loadPlot}), so its code is only
 * fetched once a graph is shown.
 */

export type UPlot = typeof uPlot;

/** Loads uPlot and its stylesheet. */
export async function loadPlot(): Promise<UPlot> {
  const [{ default: plot }] = await Promise.all([
    import('uplot'),
    import('uplot/dist/uPlot.min.css'),
  ]);

  return plot;
}

export const PLOT_HEIGHT = 140;

/** Seconds ago as an axis label: "now", "−30 s", "−5 min". */
export function formatAgo(seconds: number): string {
  const ago = Math.round(-seconds);

  if (ago <= 0) {
    return 'now';
  }

  return ago >= 60 && ago % 60 === 0
    ? `−${String(ago / 60)} min`
    : `−${String(ago)} s`;
}

/**
 * Whether this browser can draw a chart. jsdom (the unit tests) has neither
 * `matchMedia` nor a 2D canvas, so charts there show their text summary only.
 */
export function canPlot(): boolean {
  if (typeof window.matchMedia !== 'function') {
    return false;
  }

  try {
    return document.createElement('canvas').getContext('2d') !== null;
  } catch {
    return false;
  }
}

function token(chart: uPlot, name: string): string {
  return getComputedStyle(chart.root).getPropertyValue(name).trim();
}

/** A fixed range with a margin, so lines at its ends stay clear of the edges. */
function padded([min, max]: readonly [number, number]): [number, number] {
  const margin = (max - min) * 0.1;

  return [min - margin, max + margin];
}

export function plotOptions(
  plot: UPlot,
  metric: Metric,
  { width, windowSeconds }: { width: number; windowSeconds: number },
): uPlot.Options {
  const { step = false, range } = metric.chart;
  // Optional in uPlot's types, but part of every build we ship.
  const stepped = plot.paths.stepped;
  const muted = (chart: uPlot) => token(chart, '--text-muted');
  const grid = (chart: uPlot) => token(chart, '--border');
  const font = `12px ${getComputedStyle(document.body).fontFamily}`;
  const axis: uPlot.Axis = {
    stroke: muted,
    font,
    grid: { stroke: grid, width: 1 },
    ticks: { stroke: grid, width: 1, size: 4 },
  };

  return {
    width,
    height: PLOT_HEIGHT,
    legend: { show: false },
    cursor: { show: false, drag: { x: false, y: false } },
    scales: {
      x: { time: false, auto: false, range: [-windowSeconds, 0] },
      y: range
        ? { auto: false, range: padded(range) }
        : // Fit the data, with a 10 % margin and round-number ends.
          { range: (_chart, min, max) => plot.rangeNum(min, max, 0.1, true) },
    },
    axes: [
      {
        ...axis,
        space: 60,
        incrs: [1, 2, 5, 10, 15, 30, 60, 120, 300, 600],
        values: (_chart, splits) => splits.map(formatAgo),
      },
      {
        ...axis,
        // Wide enough for "No reading", so the graphs line up.
        size: 76,
        ...(step
          ? {
              // One tick per state, labelled as the tile would say it.
              splits: (_chart, _axis, min, max) =>
                Array.from(
                  { length: Math.floor(max) - Math.ceil(min) + 1 },
                  (_, i) => Math.ceil(min) + i,
                ),
              values: (_chart, splits) =>
                splits.map((value) => metric.format(value)),
            }
          : {}),
      },
    ],
    series: [
      {},
      {
        label: metric.label,
        stroke: (chart) => token(chart, '--accent'),
        width: 2,
        points: { show: false },
        spanGaps: false,
        ...(stepped && step ? { paths: stepped({ align: 1 }) } : {}),
      },
    ],
  };
}

/** Tick spacings for the timeline's x axis, in seconds. */
const TIMELINE_INCRS = [
  0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200,
];

/**
 * Seconds into a recording as an axis label: "0:00", "1:05", "1:02:03".
 * When the ticks are under a second apart, tenths are added: "0:01.5".
 */
export function formatTimelineTick(seconds: number, spacing: number): string {
  const clock = formatDuration(seconds * 1000);

  if (spacing >= 1) {
    return clock;
  }

  const tenths = Math.round((seconds % 1) * 10) % 10;

  return `${clock}.${String(tenths)}`;
}

/**
 * uPlot options for one metric on replay's timeline. The x axis is seconds
 * into the recording, over the range `xRange` returns (the visible window),
 * so the chart zooms and pans without being rebuilt. The cursor shows a
 * crosshair that every chart with the same `syncKey` follows.
 */
export function timelinePlotOptions(
  plot: UPlot,
  metric: Metric,
  {
    width,
    syncKey,
    xRange,
  }: { width: number; syncKey: string; xRange(): [number, number] },
): uPlot.Options {
  const options = plotOptions(plot, metric, { width, windowSeconds: 0 });
  const [xAxis, yAxis] = options.axes ?? [];

  return {
    ...options,
    cursor: {
      show: true,
      x: true,
      y: false,
      points: { show: false },
      // Dragging is the timeline's own gesture (see timelineGestures).
      drag: { x: false, y: false },
      sync: { key: syncKey, setSeries: false },
    },
    scales: {
      ...options.scales,
      x: { time: false, auto: false, range: () => xRange() },
    },
    axes: [
      {
        ...xAxis,
        space: 70,
        incrs: TIMELINE_INCRS,
        values: (_chart, splits, _axis, _space, spacing) =>
          splits.map((split) => formatTimelineTick(split, spacing)),
      },
      { ...yAxis },
    ],
  };
}

export const OVERVIEW_HEIGHT = 64;

/**
 * uPlot options for the overview strip: one metric over the whole
 * recording, `durationSeconds` long, with time labels and no y axis.
 */
export function overviewPlotOptions(
  plot: UPlot,
  metric: Metric,
  { width, durationSeconds }: { width: number; durationSeconds: number },
): uPlot.Options {
  const options = timelinePlotOptions(plot, metric, {
    width,
    syncKey: '',
    xRange: () => [0, Math.max(durationSeconds, 0.001)],
  });
  const [xAxis] = options.axes ?? [];

  return {
    ...options,
    height: OVERVIEW_HEIGHT,
    cursor: { show: false, drag: { x: false, y: false } },
    axes: [{ ...xAxis, size: 24 }, { show: false }],
  };
}

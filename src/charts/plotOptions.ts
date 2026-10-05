// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type uPlot from 'uplot';
import type { Metric } from '../metrics';

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

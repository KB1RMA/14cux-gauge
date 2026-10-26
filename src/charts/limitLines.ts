// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type uPlot from 'uplot';
import type { DisplayUnits, Metric } from '../metrics';
import { LIMIT_LEVELS, type Limits } from '../model/limits';

export interface LimitLine {
  /** The level, in display units. */
  value: number;
  tone: 'warn' | 'alert';
}

/** The levels set in `limits`, as lines in display units. */
export function limitLinesFor(
  metric: Metric,
  limits: Limits,
  units: DisplayUnits,
): LimitLine[] {
  return LIMIT_LEVELS.flatMap((level) => {
    const sample = limits[level];

    return sample === undefined
      ? []
      : [
          {
            value: metric.toDisplay(sample, units),
            tone: level.endsWith('Alert') ? 'alert' : 'warn',
          },
        ];
  });
}

/**
 * A uPlot plugin that draws each of `lines()` across the plot as a dashed
 * line, under the data, in the theme's warning or danger colour. A level
 * outside the y axis's range is not drawn, and does not stretch the axis;
 * the graph's text lists every level. Read on each draw, so the lines follow
 * changes without the chart being rebuilt.
 */
export function limitLinesPlugin(
  /** uPlot itself, whose `pxRatio` is canvas pixels per CSS pixel now. */
  plot: { readonly pxRatio: number },
  lines: () => readonly LimitLine[],
): uPlot.Plugin {
  return {
    hooks: {
      drawAxes: (chart) => {
        const { ctx, bbox } = chart;
        const style = getComputedStyle(chart.root);
        const { pxRatio } = plot;

        for (const line of lines()) {
          const y = chart.valToPos(line.value, 'y', true);

          if (!(y >= bbox.top && y <= bbox.top + bbox.height)) {
            continue;
          }

          ctx.save();
          ctx.strokeStyle = style
            .getPropertyValue(line.tone === 'alert' ? '--danger' : '--warn')
            .trim();
          ctx.lineWidth = pxRatio;
          ctx.setLineDash([6 * pxRatio, 4 * pxRatio]);
          ctx.beginPath();
          ctx.moveTo(bbox.left, y);
          ctx.lineTo(bbox.left + bbox.width, y);
          ctx.stroke();
          ctx.restore();
        }
      },
    },
  };
}

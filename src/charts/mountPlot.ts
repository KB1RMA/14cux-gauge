// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type uPlot from 'uplot';
import { canPlot, loadPlot, type UPlot } from './plotOptions';

/**
 * Builds a chart in `container` once uPlot has loaded, and keeps it as
 * wide as the container. `onChart` is told when the chart is ready, and
 * told `null` when it goes. Returns a function that removes the chart, or
 * stops it being built if uPlot is still loading. Where nothing can be
 * drawn (jsdom), it does nothing.
 */
export function mountPlot(
  container: HTMLElement,
  build: (plot: UPlot, width: number) => uPlot,
  onChart: (chart: uPlot | null) => void = () => {},
): () => void {
  if (!canPlot()) {
    return () => {};
  }

  let disposed = false;

  let dispose = () => {
    disposed = true;
  };

  void loadPlot().then((plot) => {
    if (disposed) {
      return;
    }

    const chart = build(plot, container.clientWidth);
    const resize = new ResizeObserver(() => {
      chart.setSize({ width: container.clientWidth, height: chart.height });
    });

    resize.observe(container);
    onChart(chart);

    dispose = () => {
      resize.disconnect();
      chart.destroy();
      onChart(null);
    };
  });

  return () => {
    dispose();
  };
}

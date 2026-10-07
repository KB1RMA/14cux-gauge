// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type uPlot from 'uplot';
import { canPlot, loadPlot, type UPlot } from './plotOptions';

/**
 * Builds a chart in `container` once uPlot has loaded, and keeps it as
 * wide as the container, on screen and when printed. `onChart` is told
 * when the chart is ready, and told `null` when it goes. Returns a function that removes the chart, or
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

    const fit = () => {
      chart.setSize({ width: container.clientWidth, height: chart.height });
    };

    const resize = new ResizeObserver(fit);
    // Printing lays the page out at the paper's width, but the browser
    // snapshots it without running resize observers, so the canvas would
    // keep its screen width. The print media query changes once the print
    // layout applies (and again when it ends), so refit then.
    const print = window.matchMedia('print');

    resize.observe(container);
    print.addEventListener('change', fit);
    onChart(chart);

    dispose = () => {
      resize.disconnect();
      print.removeEventListener('change', fit);
      chart.destroy();
      onChart(null);
    };
  });

  return () => {
    dispose();
  };
}

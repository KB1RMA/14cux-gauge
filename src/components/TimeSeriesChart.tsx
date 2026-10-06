// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useId, useRef } from 'react';
import type uPlot from 'uplot';
import { mountPlot } from '../charts/mountPlot';
import { plotOptions } from '../charts/plotOptions';
import { useHistory } from '../history/useHistory';
import type { Metric } from '../metrics';
import { usePreferences } from '../preferences/usePreferences';
import { ChartCaption, ChartStats } from './ChartParts';
import styles from './TimeSeriesChart.module.css';

function summarise(values: readonly (number | null)[]) {
  let min: number | undefined;
  let max: number | undefined;

  for (const value of values) {
    if (value !== null) {
      min = min === undefined ? value : Math.min(min, value);
      max = max === undefined ? value : Math.max(max, value);
    }
  }

  return { now: values.at(-1), min, max };
}

/**
 * One metric's recent history as a scrolling line graph, with its latest,
 * lowest and highest values as text. The canvas is hidden from assistive
 * tech; the text carries the same information.
 */
export function TimeSeriesChart({
  metric,
  windowSeconds,
}: {
  metric: Metric;
  windowSeconds: number;
}) {
  const units = usePreferences();
  const { history } = useHistory();
  const captionId = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const dataRef = useRef<uPlot.AlignedData>([[], []]);
  const latest = history.latestTime ?? 0;
  const { times, values } = history.window(
    metric.key,
    latest - windowSeconds * 1000,
  );
  const shown = values.map((v) =>
    v === null ? null : metric.toDisplay(v, units),
  );
  const unit = metric.unit(units);
  const summary = summarise(shown);
  const format = (value: number) =>
    unit ? `${metric.format(value)} ${unit}` : metric.format(value);

  // The chart is built once per metric and window, then fed new data.
  useEffect(() => {
    const container = plotRef.current;

    if (!container) {
      return undefined;
    }

    return mountPlot(
      container,
      (plot, width) =>
        new plot(
          plotOptions(plot, metric, { width, windowSeconds }),
          dataRef.current,
          container,
        ),
      (chart) => {
        chartRef.current = chart;
      },
    );
  }, [metric, windowSeconds]);

  // After every render: keep the latest data for a chart still loading, and
  // hand it to a chart already drawn.
  useEffect(() => {
    dataRef.current = [times.map((time) => (time - latest) / 1000), shown];
    // Rescales y to fit the data; x is fixed to the window.
    chartRef.current?.setData(dataRef.current, true);
  });

  return (
    // Named explicitly: not every accessibility API derives a figure's name
    // from its caption.
    <figure className={styles['chart']} aria-labelledby={captionId}>
      <ChartCaption id={captionId} label={metric.label} unit={unit} />
      <ChartStats {...summary} step={metric.chart.step} format={format} />
      <div ref={plotRef} className={styles['plot']} aria-hidden="true" />
    </figure>
  );
}

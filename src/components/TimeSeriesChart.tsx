// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useEffect, useId, useRef } from 'react';
import type uPlot from 'uplot';
import { mountPlot } from '../charts/mountPlot';
import { plotOptions } from '../charts/plotOptions';
import { chartData, extremes } from '../history/chartSeries';
import { useHistory } from '../history/useHistory';
import type { Metric } from '../metrics';
import { usePreferences } from '../preferences/usePreferences';
import { ChartCaption, ChartStats } from './ChartParts';
import type { GraphWindow } from '../settings/graphSettings';
import styles from './TimeSeriesChart.module.css';

/**
 * About one bucket per pixel of the widest graph: thinning to this keeps
 * the drawing fast over a long session without changing what it shows.
 */
const BUCKETS = 1000;

/** The session window's shortest span, so a new session is not stretched. */
const MIN_SESSION_SECONDS = 30;

/**
 * One metric's recent history as a scrolling line graph, with its latest,
 * lowest and highest values as text. The canvas is hidden from assistive
 * tech; the text carries the same information.
 *
 * `timeWindow` is the seconds shown, or `'session'` for every sample held. The
 * samples are thinned to a few per pixel, keeping each one's extremes
 * (see `SampleHistory.thinned`, which replay draws through too), so the lowest and highest are exact.
 */
export function TimeSeriesChart({
  metric,
  timeWindow,
}: {
  metric: Metric;
  timeWindow: GraphWindow;
}) {
  const units = usePreferences();
  const { history } = useHistory();
  const captionId = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const dataRef = useRef<uPlot.AlignedData>([[], []]);
  const spanRef = useRef(MIN_SESSION_SECONDS);
  const latest = history.latestTime ?? 0;
  const span =
    timeWindow === 'session'
      ? Math.max(
          MIN_SESSION_SECONDS,
          (latest - (history.earliestTime ?? latest)) / 1000,
        )
      : timeWindow;
  const convert = (value: number) => metric.toDisplay(value, units);
  const [times, shown] = chartData(
    history,
    metric.key,
    { since: latest - span * 1000, origin: latest, buckets: BUCKETS },
    convert,
  );
  const unit = metric.unit(units);
  const summary = { now: shown.at(-1), ...extremes(shown) };
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
          plotOptions(plot, metric, {
            width,
            windowSeconds:
              timeWindow === 'session' ? () => spanRef.current : timeWindow,
          }),
          dataRef.current,
          container,
        ),
      (chart) => {
        chartRef.current = chart;
      },
    );
  }, [metric, timeWindow]);

  // After every render: keep the latest data for a chart still loading, and
  // hand it to a chart already drawn.
  useEffect(() => {
    spanRef.current = span;
    dataRef.current = [times, shown];
    // Rescales y to fit the data, and x to the window.
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

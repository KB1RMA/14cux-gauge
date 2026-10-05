// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { VisuallyHidden } from 'radix-ui';
import { useEffect, useId, useRef } from 'react';
import type uPlot from 'uplot';
import {
  canPlot,
  loadPlot,
  PLOT_HEIGHT,
  plotOptions,
} from '../charts/plotOptions';
import { useHistory } from '../history/useHistory';
import type { Metric } from '../metrics';
import { usePreferences } from '../preferences/usePreferences';
import styles from './TimeSeriesChart.module.css';

interface Summary {
  now: number | null | undefined;
  min: number | undefined;
  max: number | undefined;
}

function summarise(values: readonly (number | null)[]): Summary {
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

function Stat({
  term,
  value,
  format,
}: {
  term: string;
  value: number | null | undefined;
  format(value: number): string;
}) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>
        {value === null ? (
          <>
            <span aria-hidden="true">—</span>
            <VisuallyHidden.Root>No valid reading</VisuallyHidden.Root>
          </>
        ) : value === undefined ? (
          <>
            <span aria-hidden="true">—</span>
            <VisuallyHidden.Root>No data yet</VisuallyHidden.Root>
          </>
        ) : (
          format(value)
        )}
      </dd>
    </div>
  );
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

    if (!container || !canPlot()) {
      return undefined;
    }

    let disposed = false;

    let dispose = () => {
      disposed = true;
    };

    void loadPlot().then((plot) => {
      if (disposed) {
        return;
      }

      const chart = new plot(
        plotOptions(plot, metric, {
          width: container.clientWidth,
          windowSeconds,
        }),
        dataRef.current,
        container,
      );
      const resize = new ResizeObserver(() => {
        chart.setSize({ width: container.clientWidth, height: PLOT_HEIGHT });
      });

      chartRef.current = chart;
      resize.observe(container);

      dispose = () => {
        resize.disconnect();
        chart.destroy();
        chartRef.current = null;
      };
    });

    return () => {
      dispose();
    };
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
      <figcaption id={captionId} className={styles['caption']}>
        {metric.label}
        {unit ? (
          <>
            {' '}
            <span className={styles['unit']}>({unit})</span>
          </>
        ) : null}
      </figcaption>
      <dl className={styles['stats']}>
        <Stat term="Now" value={summary.now} format={format} />
        {metric.chart.step ? null : (
          <>
            <Stat term="Min" value={summary.min} format={format} />
            <Stat term="Max" value={summary.max} format={format} />
          </>
        )}
      </dl>
      <div ref={plotRef} className={styles['plot']} aria-hidden="true" />
    </figure>
  );
}

// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import type uPlot from 'uplot';
import { mountPlot } from '../charts/mountPlot';
import { formatTimelineTick, timelinePlotOptions } from '../charts/plotOptions';
import {
  marks,
  overlay,
  placeLine,
  timelineGestures,
  type Overlay,
  type TimelineMark,
} from '../charts/timelinePlugins';
import { chartData, extremesOf } from '../history/chartSeries';
import type { ReadonlySeries } from '../history/sampleHistory';
import type { Metric, MetricKey } from '../metrics';
import { usePreferences } from '../preferences/usePreferences';
import type { Replay } from '../replay/useReplay';
import { ChartCaption, ChartStats } from './ChartParts';
import styles from './TimeSeriesChart.module.css';
import timeline from './Timeline.module.css';

const NO_MARKS: readonly TimelineMark[] = [];

/**
 * Buckets the window's lowest and highest are worked out over. Thinning
 * keeps every extreme, so they are exact whatever this is.
 */
const BUCKET_COUNT = 1000;

/** Buckets per pixel of width the samples are thinned to. */
const BUCKETS_PER_PIXEL = 1;

/**
 * One metric of a recording on the timeline: the visible window as a line
 * graph with the playhead over it, and as text the value at the playhead
 * and the lowest and highest values in the window. The canvas is hidden
 * from assistive tech; the text carries the same information, and the
 * replay controls and timeline slider do everything the pointer can.
 *
 * `series` holds the recording's samples, and `writes` the writes to the
 * ECU made during it; neither may change. Times on the replay are
 * milliseconds from the first sample.
 */
export function TimelineChart({
  metric,
  series,
  replay,
  syncKey,
  writes = NO_MARKS,
}: {
  metric: Metric;
  series: ReadonlySeries<MetricKey>;
  replay: Replay;
  syncKey: string;
  writes?: readonly TimelineMark[];
}) {
  const units = usePreferences();
  const captionId = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const playheadRef = useRef<Overlay | null>(null);
  const { position, view } = replay;
  const origin = series.earliestTime ?? 0;
  const convert = useCallback(
    (value: number) => metric.toDisplay(value, units),
    [metric, units],
  );
  const from = view.start / 1000;
  const to = view.end / 1000;
  const { min, max } = useMemo(
    () =>
      extremesOf(
        series,
        metric.key,
        {
          since: origin + view.start,
          until: origin + view.end,
          buckets: BUCKET_COUNT,
        },
        convert,
      ),
    [series, metric, convert, origin, view.start, view.end],
  );
  const now = series.valueAt(metric.key, origin + position);
  const unit = metric.unit(units);
  const format = (value: number) =>
    unit ? `${metric.format(value)} ${unit}` : metric.format(value);
  // What the chart's own handlers need, which outlive any one render.
  const latestRef = useRef({ replay, convert, format });

  useEffect(() => {
    latestRef.current = { replay, convert, format };
  });

  // Built once per metric; zooming, panning and playback only update it.
  useEffect(() => {
    const container = plotRef.current;

    if (!container) {
      return undefined;
    }

    const seconds = (): [number, number] => {
      const { start, end } = latestRef.current.replay.view;

      return [start / 1000, Math.max(end, start + 1) / 1000];
    };

    const data = (width: number): uPlot.AlignedData => {
      const [start, end] = seconds();

      return chartData(
        series,
        metric.key,
        {
          since: origin + start * 1000,
          until: origin + end * 1000,
          origin,
          buckets: width * BUCKETS_PER_PIXEL,
          edges: true,
        },
        latestRef.current.convert,
      );
    };

    return mountPlot(
      container,
      (plot, width) => {
        // Unlabelled: a label would cover samples. The overview strip and
        // the list of writes name them.
        const writeMarks = marks(writes, {
          className: timeline['marks'] ?? '',
          markClassName: timeline['mark'] ?? '',
        });
        const playhead = overlay(timeline['playhead'] ?? '', (chart, line) => {
          placeLine(chart, line, latestRef.current.replay.position / 1000);
        });
        const readout = overlay(
          timeline['readout'] ?? '',
          (chart, label) => {
            const { idx, left = -1 } = chart.cursor;
            const time =
              idx === null || idx === undefined
                ? undefined
                : chart.data[0][idx];

            label.hidden = time === undefined || left < 0;

            if (label.hidden || idx === null || idx === undefined) {
              return;
            }

            const value = chart.data[1]?.[idx];

            label.textContent = `${formatTimelineTick(time ?? 0, 0.1)} · ${
              value === null || value === undefined
                ? 'No reading'
                : latestRef.current.format(value)
            }`;
            // Beside the crosshair, on whichever side has room.
            label.style.transform =
              left > chart.over.clientWidth / 2
                ? `translateX(calc(${String(left)}px - 100% - 6px))`
                : `translateX(${String(left + 6)}px)`;
          },
          ['setCursor'],
        );

        playheadRef.current = playhead;

        return new plot(
          {
            ...timelinePlotOptions(plot, metric, {
              width,
              syncKey,
              xRange: seconds,
            }),
            plugins: [
              timelineGestures({
                view: () => latestRef.current.replay.view,
                duration: () => latestRef.current.replay.duration,
                onViewChange: (next) => {
                  latestRef.current.replay.setView(next);
                },
                onSeek: (next) => {
                  latestRef.current.replay.seek(next);
                },
              }),
              writeMarks.plugin,
              playhead.plugin,
              readout.plugin,
            ],
          },
          data(width),
          container,
        );
      },
      (chart) => {
        chartRef.current = chart;
      },
    );
  }, [metric, syncKey, series, origin, writes]);

  // A new window or new units: draw the samples now in view.
  useEffect(() => {
    const chart = chartRef.current;

    if (chart) {
      chart.setData(
        chartData(
          series,
          metric.key,
          {
            since: origin + from * 1000,
            until: origin + Math.max(to, from + 0.001) * 1000,
            origin,
            buckets: chart.width * BUCKETS_PER_PIXEL,
            edges: true,
          },
          convert,
        ),
        true,
      );
    }
  }, [series, metric, convert, origin, from, to]);

  useEffect(() => {
    playheadRef.current?.update();
  }, [position]);

  return (
    // Named explicitly: not every accessibility API derives a figure's name
    // from its caption.
    <figure className={styles['chart']} aria-labelledby={captionId}>
      <ChartCaption id={captionId} label={metric.label} unit={unit} />
      <ChartStats
        now={now === null || now === undefined ? now : convert(now)}
        min={min}
        max={max}
        step={metric.chart.step}
        format={format}
      />
      <div
        ref={plotRef}
        className={`${styles['plot'] ?? ''} ${timeline['plot'] ?? ''}`}
        aria-hidden="true"
      />
    </figure>
  );
}

// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { ZoomInIcon, ZoomOutIcon } from '@radix-ui/react-icons';
import { Slider } from 'radix-ui';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type uPlot from 'uplot';
import { mountPlot } from '../charts/mountPlot';
import { overviewPlotOptions } from '../charts/plotOptions';
import {
  marks,
  overlay,
  overviewGestures,
  placeLine,
  placeSpan,
  type Overlay,
  type TimelineMark,
} from '../charts/timelinePlugins';
import { chartData } from '../history/chartSeries';
import type { ReadonlySeries } from '../history/sampleHistory';
import type { Metric, MetricKey } from '../metrics';
import { usePreferences } from '../preferences/usePreferences';
import {
  MIN_WINDOW_MS,
  sliderEnd,
  sliderStep,
  wholeWindow,
  zoomWindow,
} from '../replay/timeline';
import type { Replay } from '../replay/useReplay';
import {
  describeDuration,
  formatDuration,
  formatPreciseDuration,
} from '../sessions/format';
import styles from './Timeline.module.css';

const NO_MARKS: readonly TimelineMark[] = [];

/** A time for a screen reader, in tenths of a second if the step is finer. */
function describeTime(ms: number, step: number): string {
  if (step >= 1000) {
    return describeDuration(ms);
  }

  const seconds = (ms / 1000).toFixed(1);

  return `${seconds} ${seconds === '1.0' ? 'second' : 'seconds'}`;
}

/**
 * A button that changes the view. When it can do nothing more it says so
 * with `aria-disabled` rather than `disabled`, so it keeps focus: pressing
 * Show all, say, must not drop the keyboard user's place.
 */
function ViewButton({
  unavailable,
  onClick,
  children,
}: {
  unavailable: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-disabled={unavailable}
      onClick={unavailable ? undefined : onClick}
    >
      {children}
    </button>
  );
}

/**
 * A handle on one end of the window. While it is dragged, or has the
 * keyboard's focus, it shows the time it is at, running toward the middle of
 * the strip so the time stays on the strip wherever the handle is.
 */
function Handle({
  label,
  side,
  ms,
  max,
  step,
}: {
  label: string;
  side: 'start' | 'end';
  ms: number;
  /** Where the slider ends. */
  max: number;
  step: number;
}) {
  const [held, setHeld] = useState(false);
  const [keyed, setKeyed] = useState(false);
  // Pressing a handle focuses it; only focus from the keyboard shows the
  // time once the pointer lets go.
  const pressedRef = useRef(false);
  const toward = ms < max / 2 ? 'toRight' : 'toLeft';

  const release = () => {
    pressedRef.current = false;
    setHeld(false);
  };

  return (
    <Slider.Thumb
      className={`${styles['handle'] ?? ''} ${styles[side] ?? ''}`}
      aria-label={label}
      aria-valuetext={describeTime(ms, step)}
      onPointerDown={() => {
        pressedRef.current = true;
        setHeld(true);
      }}
      onPointerUp={release}
      onLostPointerCapture={release}
      onFocus={() => {
        setKeyed(!pressedRef.current);
      }}
      onKeyDown={() => {
        setKeyed(true);
      }}
      onBlur={() => {
        setKeyed(false);
      }}
    >
      {(held || keyed) && (
        // The value is in aria-valuetext; this is its look.
        <span
          className={`${styles['time'] ?? ''} ${styles[toward] ?? ''}`}
          aria-hidden="true"
        >
          {formatPreciseDuration(ms)}
        </span>
      )}
    </Slider.Thumb>
  );
}

/**
 * Lays the window's handles over the strip's plot area, `span` times as wide
 * as the plot (the slider's last step can run a little past the recording's
 * end), so each handle sits on the end of the window it moves.
 */
function handlesOver(frame: HTMLElement, span: () => number): uPlot.Plugin {
  const place = (chart: uPlot) => {
    const outer = frame.getBoundingClientRect();
    const plot = chart.over.getBoundingClientRect();

    frame.style.setProperty(
      '--plot-left',
      `${String(plot.left - outer.left)}px`,
    );
    frame.style.setProperty('--plot-top', `${String(plot.top - outer.top)}px`);
    frame.style.setProperty('--plot-width', `${String(plot.width * span())}px`);
    frame.style.setProperty('--plot-height', `${String(plot.height)}px`);
  };

  return { hooks: { ready: place, setSize: place } };
}

/**
 * The whole recording as a strip, with the stretch the graphs show
 * highlighted and the playhead over it, and the controls that choose that
 * stretch: a handle on each end of the highlight, and zoom buttons. The
 * handles are a slider's thumbs, so they work from the keyboard too.
 * Dragging a handle moves that end; dragging the highlight elsewhere moves
 * it; clicking the strip moves the playhead.
 *
 * `series` holds the recording's samples, and `writes` the writes to the ECU
 * made during it; neither may change.
 */
export function TimelineOverview({
  metric,
  series,
  replay,
  writes = NO_MARKS,
}: {
  metric: Metric;
  series: ReadonlySeries<MetricKey>;
  replay: Replay;
  writes?: readonly TimelineMark[];
}) {
  const units = usePreferences();
  const { position, duration, view } = replay;
  const frameRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<Overlay | null>(null);
  const playheadRef = useRef<Overlay | null>(null);
  const latestRef = useRef(replay);
  const whole = view.start <= 0 && view.end >= duration;
  const narrowest = view.end - view.start <= Math.min(MIN_WINDOW_MS, duration);
  const step = sliderStep(duration);
  const max = sliderEnd(duration);
  // Zoom around the playhead while it is in view, else the window's middle.
  const anchor =
    position >= view.start && position <= view.end
      ? position
      : (view.start + view.end) / 2;

  useEffect(() => {
    latestRef.current = replay;
  });

  useEffect(() => {
    const container = plotRef.current;
    const frame = frameRef.current;

    if (!container || !frame) {
      return undefined;
    }

    return mountPlot(container, (plot, width) => {
      const writeMarks = marks(writes, {
        className: styles['marks'] ?? '',
        markClassName: styles['mark'] ?? '',
        labelClassName: styles['markLabel'] ?? '',
      });
      const highlight = overlay(styles['window'] ?? '', (chart, element) => {
        const { start, end } = latestRef.current.view;

        placeSpan(chart, element, start / 1000, end / 1000);
      });
      const playhead = overlay(styles['playhead'] ?? '', (chart, line) => {
        placeLine(chart, line, latestRef.current.position / 1000);
      });
      const seconds = latestRef.current.duration / 1000;

      const span = () => {
        const length = latestRef.current.duration;

        return length > 0 ? sliderEnd(length) / length : 1;
      };

      windowRef.current = highlight;
      playheadRef.current = playhead;

      return new plot(
        {
          ...overviewPlotOptions(plot, metric, {
            width,
            durationSeconds: seconds,
          }),
          plugins: [
            overviewGestures({
              view: () => latestRef.current.view,
              duration: () => latestRef.current.duration,
              onViewChange: (next) => {
                latestRef.current.setView(next);
              },
              onSeek: (next) => {
                latestRef.current.seek(next);
              },
            }),
            writeMarks.plugin,
            highlight.plugin,
            playhead.plugin,
            handlesOver(frame, span),
          ],
        },
        chartData(
          series,
          metric.key,
          {
            since: -Infinity,
            origin: series.earliestTime ?? 0,
            buckets: width,
            edges: true,
          },
          (value) => metric.toDisplay(value, units),
        ),
        container,
      );
    });
  }, [metric, series, units, writes]);

  useEffect(() => {
    windowRef.current?.update();
  }, [view]);

  useEffect(() => {
    playheadRef.current?.update();
  }, [position]);

  return (
    <div className={styles['overview']}>
      <div ref={frameRef} className={styles['frame']}>
        <div ref={plotRef} className={styles['strip']} aria-hidden="true" />
        <Slider.Root
          className={styles['handles']}
          // How much of the slider the window takes, to size the handles.
          style={
            {
              '--window-fraction': (view.end - view.start) / max,
            } as CSSProperties
          }
          min={0}
          // The view is clamped back to the recording.
          max={max}
          step={step}
          minStepsBetweenThumbs={Math.max(
            Math.ceil(Math.min(MIN_WINDOW_MS, duration) / step),
            1,
          )}
          value={[view.start, view.end]}
          disabled={duration === 0}
          onValueChange={([start = 0, end = duration]) => {
            replay.setView({
              start: Math.min(start, duration),
              end: Math.min(end, duration),
            });
          }}
        >
          <Handle
            label="Graphs from"
            side="start"
            ms={view.start}
            max={max}
            step={step}
          />
          <Handle
            label="Graphs to"
            side="end"
            ms={view.end}
            max={max}
            step={step}
          />
        </Slider.Root>
      </div>
      <div className={styles['range']}>
        <div className={styles['zoom']}>
          <ViewButton
            unavailable={narrowest}
            onClick={() => {
              replay.setView(zoomWindow(view, 0.5, anchor, duration));
            }}
          >
            <ZoomInIcon aria-hidden="true" />
            Zoom in
          </ViewButton>
          <ViewButton
            unavailable={whole}
            onClick={() => {
              replay.setView(zoomWindow(view, 2, anchor, duration));
            }}
          >
            <ZoomOutIcon aria-hidden="true" />
            Zoom out
          </ViewButton>
          <ViewButton
            unavailable={whole}
            onClick={() => {
              replay.setView(wholeWindow(duration));
            }}
          >
            Show all
          </ViewButton>
        </div>
        <p className={styles['shown']}>
          Graphs show {formatDuration(view.start)} to {formatDuration(view.end)}{' '}
          of {formatDuration(duration)}.
        </p>
      </div>
    </div>
  );
}

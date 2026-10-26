// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { memo } from 'react';
import {
  arcPath,
  dialAngle,
  dialBands,
  dialBeyond,
  dialCaption,
  dialFraction,
  dialLabel,
  dialTicks,
  DIAL_START,
  DIAL_SWEEP,
  polar,
} from '../charts/dial';
import type { DialScale, DisplayUnits, Metric } from '../metrics';
import styles from './Dial.module.css';

/** The drawing's size in SVG units; the bottom is cropped below the scale. */
const WIDTH = 100;
const HEIGHT = 88;
const CENTRE = [50, 50] as const;
const TRACK = 42;
const LABELS = 29;
const NEEDLE = 40;

/** Places an HTML label over the drawing at an SVG point. */
const at = ([x, y]: readonly [number, number]) => ({
  left: `${(x / WIDTH) * 100}%`,
  top: `${(y / HEIGHT) * 100}%`,
});

/** A path through `points`, closed. */
const closed = (points: readonly (readonly [number, number])[]) =>
  `M ${points.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;

/**
 * The scale's track, bands, ticks, labels and caption: everything but the
 * needle. Memoised, so a new reading redraws only the needle.
 */
const Face = memo(function Face({
  metric,
  scale,
  units,
}: {
  metric: Metric;
  scale: DialScale;
  units: DisplayUnits;
}) {
  const ticks = dialTicks(scale);

  return (
    <>
      <path
        className={styles['track']}
        d={arcPath(CENTRE, TRACK, DIAL_START, DIAL_START + DIAL_SWEEP)}
      />
      {dialBands(metric, scale, units).map((band) => (
        <path
          key={band.from}
          className={styles['band']}
          data-tone={band.tone}
          d={arcPath(CENTRE, TRACK, dialAngle(band.from), dialAngle(band.to))}
        />
      ))}
      {ticks.map((tick) => {
        const angle = dialAngle(tick.fraction);
        const [x1, y1] = polar(CENTRE, tick.labelled ? 35 : 38, angle);
        const [x2, y2] = polar(CENTRE, TRACK + 2, angle);

        return (
          <line
            key={tick.value}
            className={styles['tick']}
            data-labelled={tick.labelled ? '' : undefined}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
          />
        );
      })}
    </>
  );
});

/** The scale's labels and caption, drawn by CSS over the face. */
const Labels = memo(function Labels({
  metric,
  scale,
  units,
}: {
  metric: Metric;
  scale: DialScale;
  units: DisplayUnits;
}) {
  return (
    <>
      {dialTicks(scale)
        .filter((tick) => tick.labelled)
        .map((tick) => (
          <span
            key={tick.value}
            className={styles['label']}
            data-text={dialLabel(metric, scale, tick.value)}
            style={at(polar(CENTRE, LABELS, dialAngle(tick.fraction)))}
          />
        ))}
      <span
        className={styles['caption']}
        data-text={dialCaption(metric, scale, units)}
        style={at([CENTRE[0], 80])}
      />
    </>
  );
});

/**
 * The needle at `display`. Off the scale, it stops at that end, dashed, with
 * an arrowhead past the end pointing the way the reading lies, so it never
 * looks like a reading at the end of the scale.
 */
function Needle({ scale, display }: { scale: DialScale; display: number }) {
  const angle = dialAngle(dialFraction(scale.range, display));
  const beyond = dialBeyond(scale.range, display);
  const [x1, y1] = polar(CENTRE, -6, angle);
  const [x2, y2] = polar(CENTRE, NEEDLE, angle);
  // Just past the end, in the open bottom of the dial.
  const end = beyond === 'low' ? DIAL_START : DIAL_START + DIAL_SWEEP;
  const outward = beyond === 'low' ? -1 : 1;

  return (
    <g className={styles['needle']} data-beyond={beyond}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <circle cx={CENTRE[0]} cy={CENTRE[1]} r={3.5} />
      {beyond ? (
        <path
          className={styles['beyond']}
          d={closed([
            polar(CENTRE, TRACK, end + outward * 12),
            polar(CENTRE, TRACK - 4, end + outward * 4),
            polar(CENTRE, TRACK + 4, end + outward * 4),
          ])}
        />
      ) : null}
    </g>
  );
}

/**
 * An analogue dial picturing a reading on its metric's scale, with bands
 * for the metric's thresholds. Hidden from assistive tech: the value text
 * beside it is the reading. The needle jumps straight to each reading, so it
 * never shows a value the ECU did not report, and with no valid sample there
 * is no needle, so it never looks like the low end of the scale.
 *
 * Its scale labels and caption are drawn by CSS from attributes, so they
 * stay out of the reading's text. Sized by its container.
 */
export function Dial({
  metric,
  scale,
  units,
  display,
}: {
  metric: Metric;
  /** Keep the same object while the scale is unchanged, so the face is not redrawn. */
  scale: DialScale;
  units: DisplayUnits;
  /** The display value, or `null` / `undefined` when there is no reading. */
  display: number | null | undefined;
}) {
  return (
    <span aria-hidden="true" className={styles['dial']}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={styles['face']}
        focusable="false"
      >
        <Face metric={metric} scale={scale} units={units} />
        {display == null ? null : <Needle scale={scale} display={display} />}
      </svg>
      <Labels metric={metric} scale={scale} units={units} />
    </span>
  );
}

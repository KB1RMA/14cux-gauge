// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { DialScale, DisplayUnits, Metric, MetricTone } from '../metrics';

/**
 * The geometry of an analogue dial, kept apart from any view so the
 * dashboard's dials and any other view that draws one agree.
 *
 * Angles are in degrees clockwise from straight up. The scale sweeps 270°,
 * from bottom left (-135°) round to bottom right (+135°), leaving the bottom
 * open.
 */

export const DIAL_START = -135;
export const DIAL_SWEEP = 270;

/**
 * How far round the scale a display value lies, from 0 (the low end) to 1
 * (the high end). A value off the scale stops at that end.
 */
export function dialFraction(
  range: DialScale['range'],
  display: number,
): number {
  const [low, high] = range;

  return Math.min(Math.max((display - low) / (high - low), 0), 1);
}

/**
 * Which end of the scale a display value lies beyond, if any, so a dial can
 * show that its needle is stopped there rather than reading that value.
 */
export function dialBeyond(
  range: DialScale['range'],
  display: number,
): 'low' | 'high' | undefined {
  const [low, high] = range;

  return display < low ? 'low' : display > high ? 'high' : undefined;
}

/** The angle for a fraction of the way round the scale. */
export function dialAngle(fraction: number): number {
  return DIAL_START + fraction * DIAL_SWEEP;
}

/** A point `radius` from the centre at `angle`. */
export function polar(
  centre: readonly [number, number],
  radius: number,
  angle: number,
): readonly [number, number] {
  const radians = (angle * Math.PI) / 180;

  return [
    centre[0] + radius * Math.sin(radians),
    centre[1] - radius * Math.cos(radians),
  ];
}

/** An SVG path along the circle `radius` from angle `from` clockwise to `to`. */
export function arcPath(
  centre: readonly [number, number],
  radius: number,
  from: number,
  to: number,
): string {
  const [x0, y0] = polar(centre, radius, from);
  const [x1, y1] = polar(centre, radius, to);
  const large = to - from > 180 ? 1 : 0;

  return `M ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1}`;
}

export interface DialTick {
  /** The tick's value in display units. */
  value: number;
  fraction: number;
  /** Labelled ticks fall on the scale's steps; the rest halve them. */
  labelled: boolean;
}

/**
 * The scale's ticks: one labelled tick on each step from the low end, and an
 * unlabelled tick halfway between each pair.
 */
export function dialTicks(scale: DialScale): DialTick[] {
  const [low, high] = scale.range;
  const halves = Math.round(((high - low) / scale.step) * 2);

  // Counted in half-steps from the low end, so no error builds up.
  return Array.from({ length: halves + 1 }, (_, index) => {
    const value = low + (index * scale.step) / 2;

    return {
      value,
      fraction: dialFraction(scale.range, value),
      labelled: index % 2 === 0,
    };
  });
}

export interface DialBand {
  from: number;
  to: number;
  tone: Exclude<MetricTone, 'normal' | 'good'>;
}

/**
 * The metric's thresholds as bands on the scale, as fractions. Each runs
 * from its threshold to the next one, or to the end of the scale. Bands off
 * the scale are left out.
 */
export function dialBands(
  metric: Metric,
  scale: DialScale,
  units: DisplayUnits,
): DialBand[] {
  const thresholds = metric.thresholds ?? [];

  return thresholds
    .map((threshold, index) => {
      const next = thresholds[index + 1];

      return {
        from: dialFraction(
          scale.range,
          metric.toDisplay(threshold.from, units),
        ),
        to: next
          ? dialFraction(scale.range, metric.toDisplay(next.from, units))
          : 1,
        tone: threshold.tone,
      };
    })
    .filter((band) => band.to > band.from);
}

/** A labelled tick's text, formatted as the metric formats its readings. */
export function dialLabel(
  metric: Metric,
  scale: DialScale,
  value: number,
): string {
  return metric.format(value / (scale.divisor ?? 1));
}

/** The scale's caption: its unit, and the labels' divisor if it has one. */
export function dialCaption(
  metric: Metric,
  scale: DialScale,
  units: DisplayUnits,
): string {
  const unit = metric.unit(units) ?? '';

  return scale.divisor ? `×${scale.divisor} ${unit}`.trim() : unit;
}

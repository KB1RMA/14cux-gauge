// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors

/**
 * The maths behind replay's timeline: which stretch of a recording the
 * graphs show, how zooming, panning and playback move it, and which samples
 * to draw. Times are milliseconds from the first sample unless a function
 * says otherwise.
 */

/** The stretch of a recording the graphs show. */
export interface TimeWindow {
  start: number;
  end: number;
}

/** The shortest stretch the graphs can zoom in to. */
export const MIN_WINDOW_MS = 1000;

/** The narrowest window allowed in a recording `duration` long. */
function minWidth(duration: number): number {
  return Math.min(MIN_WINDOW_MS, duration);
}

/**
 * Fits `view` inside a recording `duration` long. A window narrower than
 * the minimum widens around its middle; one that runs off either end slides
 * back in, keeping its width.
 */
export function clampWindow(view: TimeWindow, duration: number): TimeWindow {
  const asked = view.end - view.start;
  const width = Math.min(Math.max(asked, minWidth(duration)), duration);
  const middle = (view.start + view.end) / 2;
  const wanted = asked < width ? middle - width / 2 : view.start;
  const start = Math.min(Math.max(wanted, 0), duration - width);

  return { start, end: start + width };
}

/** The whole recording. */
export function wholeWindow(duration: number): TimeWindow {
  return { start: 0, end: duration };
}

/**
 * Scales `view` by `factor` (below 1 zooms in) around `anchor`, which stays
 * at the same place on screen.
 */
export function zoomWindow(
  view: TimeWindow,
  factor: number,
  anchor: number,
  duration: number,
): TimeWindow {
  const width = view.end - view.start;
  const scaled = Math.min(
    Math.max(width * factor, minWidth(duration)),
    duration,
  );
  const at = width > 0 ? (anchor - view.start) / width : 0.5;
  const start = anchor - at * scaled;

  return clampWindow({ start, end: start + scaled }, duration);
}

/** Moves `view` by `delta` (later if positive), keeping its width. */
export function panWindow(
  view: TimeWindow,
  delta: number,
  duration: number,
): TimeWindow {
  return clampWindow(
    { start: view.start + delta, end: view.end + delta },
    duration,
  );
}

/** The window between two times, in either order, as a drag selects it. */
export function windowBetween(
  a: number,
  b: number,
  duration: number,
): TimeWindow {
  return clampWindow({ start: Math.min(a, b), end: Math.max(a, b) }, duration);
}

/**
 * `view`, moved if need be so that `position` is in it. A position outside
 * becomes the window's start, as if the timeline had paged to it.
 */
export function revealPosition(
  view: TimeWindow,
  position: number,
  duration: number,
): TimeWindow {
  if (position >= view.start && position <= view.end) {
    return view;
  }

  return clampWindow(
    { start: position, end: position + (view.end - view.start) },
    duration,
  );
}

/**
 * `view` after playback moves from `from` to `to`. When the playhead runs
 * off the end of the window, the window pages forward to keep it in view.
 * A playhead already outside the window (the user panned away) is left
 * alone.
 */
export function followPlayback(
  view: TimeWindow,
  from: number,
  to: number,
  duration: number,
): TimeWindow {
  if (from < view.start || from > view.end || to <= view.end) {
    return view;
  }

  const width = view.end - view.start;
  const start = to > view.end + width ? to : view.end;

  return clampWindow({ start, end: start + width }, duration);
}

/** Steps a slider over a recording can move by, in milliseconds. */
const SLIDER_STEPS = [
  100, 200, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000,
];

/**
 * A step for a slider over a recording `duration` long: the largest round
 * one no more than a hundredth of it, so an arrow key moves about 1 % and
 * Page Up or Down about 10 % whatever the length.
 */
export function sliderStep(duration: number): number {
  return SLIDER_STEPS.findLast((step) => step <= duration / 100) ?? 100;
}

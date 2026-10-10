// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { overlay, type Overlay } from './timelinePlugins';

/**
 * A label beside the crosshair with the time and value of the sample
 * nearest the pointer: the real sample, never one worked out between two.
 * A gap reads "No reading". It follows the crosshair on every chart that
 * shares it, and hides when the pointer leaves.
 *
 * `time` formats the sample's x value (seconds), and `value` its y value,
 * already in display units; read them through functions so they can change
 * without the chart being rebuilt.
 */
export function cursorReadout(
  className: string,
  {
    time,
    value,
  }: { time(seconds: number): string; value(value: number): string },
): Overlay {
  return overlay(
    className,
    (chart, label) => {
      const { idx, left = -1 } = chart.cursor;
      const at = idx === null || idx === undefined ? undefined : idx;
      const seconds = at === undefined ? undefined : chart.data[0][at];

      if (at === undefined || seconds === undefined || left < 0) {
        label.hidden = true;

        return;
      }

      const reading = chart.data[1]?.[at];

      label.hidden = false;
      label.textContent = `${time(seconds)} · ${
        reading === null || reading === undefined
          ? 'No reading'
          : value(reading)
      }`;
      // Beside the crosshair, on whichever side has room.
      label.style.transform =
        left > chart.over.clientWidth / 2
          ? `translateX(calc(${String(left)}px - 100% - 6px))`
          : `translateX(${String(left + 6)}px)`;
    },
    ['setCursor'],
  );
}

// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type uPlot from 'uplot';
import {
  panWindow,
  windowBetween,
  zoomWindow,
  type TimeWindow,
} from '../replay/timeline';

/**
 * uPlot plugins for replay's timeline: overlays drawn as positioned
 * elements over the plot (so moving the playhead never redraws a chart),
 * and the pointer and wheel gestures that zoom, pan and seek.
 *
 * Charts plot seconds; the timeline works in milliseconds. Every handler
 * here converts at the boundary.
 */

type HookName = keyof uPlot.Hooks.Defs;

/** An element over a chart's plot area, placed by the caller. */
export interface Overlay {
  plugin: uPlot.Plugin;
  /** Places the element again, after what it shows has changed. */
  update(): void;
}

/**
 * An overlay element with `className`, placed by `place` when the chart is
 * ready, and again on each of `on` (by default, whenever the scales or size
 * change).
 */
export function overlay(
  className: string,
  place: (chart: uPlot, element: HTMLElement) => void,
  on: readonly HookName[] = ['setScale', 'setSize'],
): Overlay {
  const element = document.createElement('div');
  let current: uPlot | undefined;

  const update = () => {
    if (current) {
      place(current, element);
    }
  };

  element.className = className;

  return {
    plugin: {
      hooks: {
        init: (chart: uPlot) => {
          current = chart;
          chart.over.append(element);
        },
        ready: update,
        destroy: () => {
          current = undefined;
        },
        ...Object.fromEntries(on.map((hook) => [hook, update])),
      },
    },
    update,
  };
}

/** Places a vertical line at `seconds`, hidden when it is off the plot. */
export function placeLine(
  chart: uPlot,
  element: HTMLElement,
  seconds: number,
): void {
  const left = chart.valToPos(seconds, 'x');
  const inside = left >= 0 && left <= chart.over.clientWidth;

  element.hidden = !inside;
  element.style.transform = `translateX(${String(left)}px)`;
}

/** Spans an element from `from` to `to` seconds. */
export function placeSpan(
  chart: uPlot,
  element: HTMLElement,
  from: number,
  to: number,
): void {
  const left = chart.valToPos(from, 'x');

  element.style.left = `${String(left)}px`;
  element.style.width = `${String(chart.valToPos(to, 'x') - left)}px`;
}

/** What the timeline's gestures change. Times are milliseconds. */
export interface TimelineHandlers {
  view(): TimeWindow;
  duration(): number;
  onViewChange(view: TimeWindow): void;
  onSeek(position: number): void;
}

/** A pointer that moves less than this many pixels is a click, not a drag. */
const CLICK_SLOP = 4;

/** How much one wheel notch (100 px of scrolling) zooms. */
const WHEEL_ZOOM = 1.25;

/** Milliseconds at a pointer's x position over the plot. */
function timeAt(chart: uPlot, clientX: number): number {
  const { left } = chart.over.getBoundingClientRect();

  return chart.posToVal(clientX - left, 'x') * 1000;
}

/** A wheel event's scroll in pixels, whatever unit it came in. */
function wheelPixels(event: WheelEvent, delta: number): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return delta * 16;
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return delta * 400;
  }

  return delta;
}

/**
 * Listens on `target` until the chart is destroyed. Returns the plugin
 * hooks that add and remove the listeners.
 */
function listening(
  bind: (chart: uPlot) => [type: string, listener: EventListener][],
): uPlot.Plugin['hooks'] {
  let unbind = () => {};

  return {
    init: (chart: uPlot) => {
      const listeners = bind(chart);

      for (const [type, listener] of listeners) {
        chart.over.addEventListener(type, listener, { passive: false });
      }

      unbind = () => {
        for (const [type, listener] of listeners) {
          chart.over.removeEventListener(type, listener);
        }
      };
    },
    destroy: () => {
      unbind();
    },
  };
}

/**
 * Gestures on a timeline graph: click to move the playhead; drag across to
 * zoom to that stretch; Ctrl (or ⌘) and the wheel, or a trackpad or touch
 * pinch, to zoom around the pointer; Shift and the wheel to pan. They use
 * pointer events, so a finger works as a mouse does, rather than uPlot's
 * own drag-to-select, which only follows the mouse.
 */
export function timelineGestures(handlers: TimelineHandlers): uPlot.Plugin {
  return {
    hooks: {
      ...listening((chart) => {
        const pointers = new Map<number, number>();
        let downAt: number | undefined;
        let pinch:
          { distance: number; view: TimeWindow; anchor: number } | undefined;

        const spread = () => {
          const [a = 0, b = 0] = pointers.values();

          return Math.abs(a - b);
        };

        const clearSelection = () => {
          chart.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
        };

        return [
          [
            'wheel',
            (event) => {
              const wheel = event as WheelEvent;
              const view = handlers.view();
              const duration = handlers.duration();

              if (wheel.ctrlKey || wheel.metaKey) {
                wheel.preventDefault();
                handlers.onViewChange(
                  zoomWindow(
                    view,
                    WHEEL_ZOOM ** (wheelPixels(wheel, wheel.deltaY) / 100),
                    timeAt(chart, wheel.clientX),
                    duration,
                  ),
                );
              } else if (wheel.shiftKey) {
                wheel.preventDefault();

                // Browsers turn a vertical wheel into a horizontal one
                // while Shift is held; take whichever moved.
                const pixels = wheelPixels(
                  wheel,
                  wheel.deltaX === 0 ? wheel.deltaY : wheel.deltaX,
                );

                handlers.onViewChange(
                  panWindow(
                    view,
                    (pixels / Math.max(chart.over.clientWidth, 1)) *
                      (view.end - view.start),
                    duration,
                  ),
                );
              }
            },
          ],
          [
            'pointerdown',
            (event) => {
              const pointer = event as PointerEvent;

              chart.over.setPointerCapture(pointer.pointerId);
              pointers.set(pointer.pointerId, pointer.clientX);
              clearSelection();
              downAt = pointers.size === 1 ? pointer.clientX : undefined;

              if (pointers.size === 2) {
                const [a = 0, b = 0] = pointers.values();

                pinch = {
                  distance: Math.max(spread(), 1),
                  view: handlers.view(),
                  anchor: timeAt(chart, (a + b) / 2),
                };
              }
            },
          ],
          [
            'pointermove',
            (event) => {
              const pointer = event as PointerEvent;

              if (!pointers.has(pointer.pointerId)) {
                return;
              }

              pointers.set(pointer.pointerId, pointer.clientX);

              if (pinch && pointers.size === 2) {
                handlers.onViewChange(
                  zoomWindow(
                    pinch.view,
                    pinch.distance / Math.max(spread(), 1),
                    pinch.anchor,
                    handlers.duration(),
                  ),
                );
              } else if (
                downAt !== undefined &&
                Math.abs(pointer.clientX - downAt) >= CLICK_SLOP
              ) {
                // Shade the stretch being selected.
                const { left } = chart.over.getBoundingClientRect();

                chart.setSelect(
                  {
                    left: Math.min(downAt, pointer.clientX) - left,
                    width: Math.abs(pointer.clientX - downAt),
                    top: 0,
                    height: chart.over.clientHeight,
                  },
                  false,
                );
              }
            },
          ],
          [
            'pointerup',
            (event) => {
              const pointer = event as PointerEvent;

              pointers.delete(pointer.pointerId);
              clearSelection();

              if (downAt !== undefined) {
                if (Math.abs(pointer.clientX - downAt) < CLICK_SLOP) {
                  handlers.onSeek(timeAt(chart, pointer.clientX));
                } else {
                  handlers.onViewChange(
                    windowBetween(
                      timeAt(chart, downAt),
                      timeAt(chart, pointer.clientX),
                      handlers.duration(),
                    ),
                  );
                }
              }

              downAt = undefined;

              if (pointers.size < 2) {
                pinch = undefined;
              }
            },
          ],
          [
            'pointercancel',
            (event) => {
              pointers.delete((event as PointerEvent).pointerId);
              clearSelection();
              downAt = undefined;
              pinch = undefined;
            },
          ],
        ];
      }),
    },
  };
}

/**
 * Gestures on the overview strip: drag to move the visible window, or
 * click to move the playhead.
 */
export function overviewGestures(handlers: TimelineHandlers): uPlot.Plugin {
  return {
    hooks: listening((chart) => {
      let drag: { x: number; view: TimeWindow; moved: boolean } | undefined;

      return [
        [
          'pointerdown',
          (event) => {
            const pointer = event as PointerEvent;

            chart.over.setPointerCapture(pointer.pointerId);
            drag = { x: pointer.clientX, view: handlers.view(), moved: false };
          },
        ],
        [
          'pointermove',
          (event) => {
            const pointer = event as PointerEvent;

            if (!drag) {
              return;
            }

            const dx = pointer.clientX - drag.x;

            drag.moved ||= Math.abs(dx) >= CLICK_SLOP;

            if (drag.moved) {
              const duration = handlers.duration();

              handlers.onViewChange(
                panWindow(
                  drag.view,
                  (dx / Math.max(chart.over.clientWidth, 1)) * duration,
                  duration,
                ),
              );
            }
          },
        ],
        [
          'pointerup',
          (event) => {
            const pointer = event as PointerEvent;

            if (drag && !drag.moved) {
              handlers.onSeek(timeAt(chart, pointer.clientX));
            }

            drag = undefined;
          },
        ],
        [
          'pointercancel',
          () => {
            drag = undefined;
          },
        ],
      ];
    }),
  };
}

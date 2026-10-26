// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors

/** How a tile is shaped when it is about as wide as a reading needs. */
const TILE_ASPECT = 1.8;

/**
 * How many columns `count` tiles take in a grid `aspect` times as wide as it
 * is tall, so each tile comes out about as wide as a reading (a number and
 * its unit) needs: wider than tall, but not a thin strip. The rows are then
 * filled as evenly as they can be.
 */
export function columnsFor(count: number, aspect: number): number {
  const columns = Math.min(
    count,
    Math.max(1, Math.round(Math.sqrt((count * aspect) / TILE_ASPECT))),
  );

  return Math.ceil(count / Math.ceil(count / columns));
}

/**
 * The grid's shapes, which `DashView.module.css` tells apart by the frame's
 * aspect ratio, from `from` up to but not including `to`, and an aspect
 * ratio typical of each. Keep the bounds in step with the container queries
 * there.
 */
export const GRID_SHAPES = [
  { shape: 'tall', from: 0, to: 0.8, typical: 0.6 },
  { shape: 'square', from: 0.8, to: 1.4, typical: 1.1 },
  { shape: 'wide', from: 1.4, to: 2.2, typical: 1.8 },
  { shape: 'wider', from: 2.2, to: 3.2, typical: 2.6 },
  { shape: 'widest', from: 3.2, to: Infinity, typical: 3.6 },
] as const;

/** The column count for each grid shape, as `--columns-<shape>` properties. */
export function columnProperties(count: number): Record<string, number> {
  return Object.fromEntries(
    GRID_SHAPES.map(({ shape, typical }) => [
      `--columns-${shape}`,
      columnsFor(count, typical),
    ]),
  );
}

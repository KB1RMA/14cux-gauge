// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { columnProperties, columnsFor, GRID_SHAPES } from './dashColumns';

describe('columnsFor', () => {
  it('puts a single reading in one column, whatever the shape', () => {
    expect(columnsFor(1, 0.6)).toBe(1);
    expect(columnsFor(1, 3.6)).toBe(1);
  });

  it('lays five readings out to suit the shape', () => {
    // sqrt(5 × 0.6 / 1.8) ≈ 1.29: one column of five.
    expect(columnsFor(5, 0.6)).toBe(1);
    // sqrt(5 × 1.8 / 1.8) ≈ 2.24: rows of 2, 2 and 1.
    expect(columnsFor(5, 1.8)).toBe(2);
    // sqrt(5 × 2.6 / 1.8) ≈ 2.69: a row of 3 and a row of 2.
    expect(columnsFor(5, 2.6)).toBe(3);
  });

  it('fills the rows as evenly as they can be', () => {
    // sqrt(5 × 4.5 / 1.8) ≈ 3.54 rounds to 4, which needs two rows; 3
    // columns fill them as 3 and 2 rather than 4 and 1.
    expect(columnsFor(5, 4.5)).toBe(3);
    // sqrt(10 × 1.8 / 1.8) ≈ 3.16: four rows of 3, 3, 3 and 1.
    expect(columnsFor(10, 1.8)).toBe(3);
  });

  it('never uses more columns than there are readings', () => {
    // sqrt(2 × 3.6 / 1.8) = 2.
    expect(columnsFor(2, 3.6)).toBe(2);
    // sqrt(2 × 10 / 1.8) ≈ 3.33, but there are only 2.
    expect(columnsFor(2, 10)).toBe(2);
  });
});

describe('GRID_SHAPES', () => {
  it('covers every aspect ratio once, each typical aspect inside its shape', () => {
    GRID_SHAPES.forEach(({ from, to, typical }, index) => {
      expect(from).toBe(index === 0 ? 0 : GRID_SHAPES[index - 1]?.to);
      expect(typical).toBeGreaterThanOrEqual(from);
      expect(typical).toBeLessThan(to);
    });
    expect(GRID_SHAPES.at(-1)?.to).toBe(Infinity);
  });
});

describe('columnProperties', () => {
  it('gives five readings a column count for every shape', () => {
    expect(columnProperties(5)).toEqual({
      '--columns-tall': 1,
      '--columns-square': 2,
      '--columns-wide': 2,
      '--columns-wider': 3,
      '--columns-widest': 3,
    });
  });
});
